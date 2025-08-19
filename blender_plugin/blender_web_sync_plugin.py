import bpy
import json
import socket
import threading
import time
import zlib
from datetime import datetime
from bpy.app.handlers import persistent

bl_info = {
    "name": "Web Sync",
    "author": "Ma3h1r0",
    "version": (1, 1),
    "blender": (2, 80, 0),
    "location": "View3D > Sidebar > Web Sync",
    "description": "Sync 3D models with web browser in real-time",
    "category": "3D View",
}

# Global variables
tcp_socket = None
is_server_running = False
last_data = None
last_frame_sync_time = 0
last_depsgraph_sync_time = 0
frame_sync_throttle = 0.016  # ~60 FPS max (16ms between updates)
receive_thread = None
stop_receive_thread = False

# Track received transform data for UI display
received_transform_data = {
    "last_received": None,
    "object_name": "",
    "position": [0, 0, 0],
    "rotation": [0, 0, 0],
    "scale": [1, 1, 1],
    "timestamp": "",
    "total_received": 0
}

# Anti-feedback protection
is_applying_external_transform = False
external_transform_cooldown_end = 0
last_applied_transform = None

# Texture cache to avoid re-encoding unchanged textures
texture_cache = {}  # filepath -> {"hash": str, "data": str, "size": int, "format": str}

sync_stats = {
    "start_time": None,
    "packets_sent": 0,
    "bytes_sent": 0,
    "last_sync_time": None,
    "sync_rate": 0,
    "errors": 0,
    "textures_cached": 0,
    "textures_sent": 0,
}


def log_message(message, level="INFO"):
    """Log message with timestamp"""
    timestamp = datetime.now().strftime("%Y-%m-%d %H:%M:%S.%f")[:-3]
    print(f"[{timestamp}] [{level}] WebSync: {message}")


def clear_external_transform_flag():
    """Clear the external transform application flag"""
    global is_applying_external_transform
    is_applying_external_transform = False
    log_message("🔓 External transform application complete, ready for normal sync")
    return None  # Don't reschedule


def apply_transform_update(transform_data):
    """Apply transform update to Blender object with anti-feedback protection"""
    global received_transform_data, is_applying_external_transform, external_transform_cooldown_end, last_applied_transform
    
    try:
        object_name = transform_data.get("objectName", "")
        position = transform_data.get("position", [0, 0, 0])
        rotation = transform_data.get("rotation", [0, 0, 0])
        scale = transform_data.get("scale", [1, 1, 1])
        timestamp = transform_data.get("timestamp", "")
        
        # Update received data tracking for UI display
        received_transform_data.update({
            "last_received": time.time(),
            "object_name": object_name,
            "position": position.copy(),
            "rotation": rotation.copy(),
            "scale": scale.copy(),
            "timestamp": datetime.fromtimestamp(timestamp / 1000).strftime("%H:%M:%S.%f")[:-3] if timestamp else "",
            "total_received": received_transform_data["total_received"] + 1
        })
        
        log_message(f"Applying external transform to '{object_name}': pos={position}, rot={rotation}, scale={scale}")
        
        # Set protection flags to prevent feedback
        is_applying_external_transform = True
        external_transform_cooldown_end = time.time() + 1.0  # 1 second cooldown
        
        # Store the applied transform to avoid re-processing
        last_applied_transform = {
            "object_name": object_name,
            "position": position.copy(),
            "rotation": rotation.copy(),
            "scale": scale.copy(),
            "timestamp": timestamp
        }
        
        # Find the object in Blender scene
        obj = None
        if object_name == "TestBox":
            # Handle special test box case
            obj = bpy.data.objects.get("TestBox") or bpy.data.objects.get("Cube")
        else:
            obj = bpy.data.objects.get(object_name)
        
        if obj:
            # Data is already in Blender coordinate system due to Three.js conversion
            # Apply transform directly without additional coordinate conversion
            obj.location = position
            obj.rotation_euler = rotation
            obj.scale = scale
            
            # Update the scene
            bpy.context.view_layer.update()
            log_message(f"✅ External transform applied to '{object_name}' (anti-feedback protection active)")
        else:
            log_message(f"❌ Object '{object_name}' not found in scene", "WARNING")
        
        # Schedule flag clearing after a brief moment
        bpy.app.timers.register(clear_external_transform_flag, first_interval=0.1)
            
    except Exception as e:
        # Reset protection flag on error
        is_applying_external_transform = False
        log_message(f"Error applying transform: {str(e)}", "ERROR")


def receive_messages():
    """Thread function to receive messages from server with robust error handling"""
    global tcp_socket, stop_receive_thread
    
    log_message("Receive thread started")
    
    while not stop_receive_thread and tcp_socket:
        try:
            # Receive message size (4 bytes) with proper handling
            size_data = b""
            while len(size_data) < 4 and not stop_receive_thread:
                try:
                    chunk = tcp_socket.recv(4 - len(size_data))
                    if not chunk:
                        log_message("Connection closed by server", "WARNING")
                        return
                    size_data += chunk
                except socket.timeout:
                    continue
                except Exception as e:
                    log_message(f"Error receiving header: {str(e)}", "ERROR")
                    return
            
            if len(size_data) < 4:
                continue
                
            message_size = int.from_bytes(size_data, byteorder="big")
            
            # Validate message size
            if message_size > 10 * 1024 * 1024:  # 10MB max for received messages
                log_message(f"Received message too large: {message_size} bytes", "ERROR")
                continue
            
            log_message(f"📦 Expecting message: {message_size} bytes", "DEBUG")
            
            # Receive the actual message in chunks
            message_data = b""
            while len(message_data) < message_size and not stop_receive_thread:
                remaining = message_size - len(message_data)
                chunk_size = min(remaining, 64 * 1024)  # 64KB chunks
                
                try:
                    chunk = tcp_socket.recv(chunk_size)
                    if not chunk:
                        log_message("Connection closed during message receive", "WARNING")
                        return
                    message_data += chunk
                    log_message(f"📥 Received chunk: {len(chunk)} bytes ({len(message_data)}/{message_size})", "DEBUG")
                except socket.timeout:
                    continue
                except Exception as e:
                    log_message(f"Error receiving message data: {str(e)}", "ERROR")
                    return
            
            if len(message_data) == message_size:
                try:
                    message_str = message_data.decode('utf-8')
                    message = json.loads(message_str)
                    log_message(f"📨 Received complete message: {message.get('type', 'unknown')} ({len(message_data)} bytes)")
                    
                    if message.get('type') == 'transform_update':
                        # Queue the transform update to be applied in the main thread
                        bpy.app.timers.register(lambda msg=message: apply_transform_update(msg), first_interval=0.001)
                        log_message(f"🔄 Transform update queued for object: {message.get('objectName', 'unknown')}")
                        
                except (json.JSONDecodeError, UnicodeDecodeError) as e:
                    log_message(f"Error parsing received message: {str(e)}", "ERROR")
                    log_message(f"Message preview: {message_data[:100]}...", "DEBUG")
            else:
                log_message(f"Incomplete message received: {len(message_data)}/{message_size} bytes", "ERROR")
                    
        except socket.timeout:
            continue
        except Exception as e:
            if not stop_receive_thread:
                log_message(f"Critical error in receive thread: {str(e)}", "ERROR")
            break
    
    log_message("Receive thread stopped")


def calculate_fast_hash(data):
    """Calculate a fast hash of binary data for caching"""
    import hashlib
    # Use MD5 for speed (not security), or just check file size + modification time
    hasher = hashlib.md5()
    hasher.update(data)
    return hasher.hexdigest()


def get_file_cache_key(image_path):
    """Get cache key based on filepath and modification time"""
    import os
    try:
        stat = os.stat(image_path)
        # Use filepath + size + modification time as cache key
        return f"{image_path}|{stat.st_size}|{int(stat.st_mtime)}"
    except:
        return image_path


def format_bytes(size):
    """Format byte size to human readable format"""
    for unit in ["B", "KB", "MB"]:
        if size < 1024.0:
            return f"{size:.2f} {unit}"
        size /= 1024.0
    return f"{size:.2f} GB"


def update_sync_stats(data_size=0, is_error=False):
    """Update synchronization statistics"""
    global sync_stats
    current_time = time.time()

    if sync_stats["start_time"] is None:
        sync_stats["start_time"] = current_time

    if not is_error:
        sync_stats["packets_sent"] += 1
        sync_stats["bytes_sent"] += data_size

        if sync_stats["last_sync_time"]:
            delta = current_time - sync_stats["last_sync_time"]
            sync_stats["sync_rate"] = 1.0 / delta if delta > 0 else 0

        sync_stats["last_sync_time"] = current_time
    else:
        sync_stats["errors"] += 1


def get_sync_stats():
    """Get formatted synchronization statistics string"""
    if not sync_stats["start_time"]:
        return "Sync not started"

    runtime = time.time() - sync_stats["start_time"]
    hours = int(runtime // 3600)
    minutes = int((runtime % 3600) // 60)
    seconds = int(runtime % 60)

    # Handle case where texture stats might not be initialized
    textures_cached = sync_stats.get('textures_cached', 0)
    textures_sent = sync_stats.get('textures_sent', 0)
    total_textures = textures_cached + textures_sent
    cache_hit_rate = (textures_cached / total_textures * 100) if total_textures > 0 else 0

    return (
        f"Runtime: {hours:02d}:{minutes:02d}:{seconds:02d}\n"
        f"Packets sent: {sync_stats['packets_sent']}\n"
        f"Data sent: {format_bytes(sync_stats['bytes_sent'])}\n"
        f"Sync rate: {sync_stats['sync_rate']:.2f} Hz\n"
        f"Errors: {sync_stats['errors']}\n"
        f"Textures cached: {textures_cached}\n"
        f"Textures sent: {textures_sent}\n"
        f"Cache hit rate: {cache_hit_rate:.1f}%"
    )


def get_received_data_info():
    """Get formatted received transform data information"""
    global received_transform_data
    
    if not received_transform_data["last_received"]:
        return "No data received yet"
    
    # Calculate time since last received
    time_since = time.time() - received_transform_data["last_received"]
    if time_since < 60:
        time_str = f"{time_since:.1f}s ago"
    else:
        minutes = int(time_since // 60)
        seconds = int(time_since % 60)
        time_str = f"{minutes}m {seconds}s ago"
    
    pos = received_transform_data["position"]
    rot = received_transform_data["rotation"]
    scale = received_transform_data["scale"]
    
    return (
        f"Total received: {received_transform_data['total_received']}\n"
        f"Last update: {time_str}\n"
        f"Object: {received_transform_data['object_name']}\n"
        f"Time: {received_transform_data['timestamp']}\n"
        f"Position: ({pos[0]:.3f}, {pos[1]:.3f}, {pos[2]:.3f})\n"
        f"Rotation: ({rot[0]:.3f}, {rot[1]:.3f}, {rot[2]:.3f})\n"
        f"Scale: ({scale[0]:.3f}, {scale[1]:.3f}, {scale[2]:.3f})"
    )


def send_data(data_str):
    """Send data to TCP server with proper framing and error handling"""
    try:
        global tcp_socket
        if not tcp_socket:
            log_message("No TCP socket available", "ERROR")
            return False

        # Encode and compress data
        try:
            data_bytes = data_str.encode('utf-8')
            compressed_data = zlib.compress(data_bytes, level=6)  # Balanced compression
            log_message(f"Compression: {len(data_bytes)} -> {len(compressed_data)} bytes ({(len(compressed_data)/len(data_bytes)*100):.1f}%)", "DEBUG")
        except Exception as e:
            log_message(f"Data compression failed: {str(e)}", "ERROR")
            return False

        # Validate compressed size
        if len(compressed_data) > 50 * 1024 * 1024:  # 50MB max
            log_message(f"Compressed data too large: {len(compressed_data)} bytes", "ERROR")
            return False

        # Send data size header (4 bytes, big-endian)
        size = len(compressed_data)
        size_header = size.to_bytes(4, byteorder="big")
        
        try:
            bytes_sent = tcp_socket.send(size_header)
            if bytes_sent != 4:
                log_message(f"Header send incomplete: {bytes_sent}/4 bytes", "ERROR")
                return False
            log_message(f"Sent header: {size} bytes expected", "DEBUG")
        except Exception as e:
            log_message(f"Failed to send header: {str(e)}", "ERROR")
            return False

        # Send compressed data in chunks to avoid partial sends
        total_sent = 0
        chunk_size = 64 * 1024  # 64KB chunks
        
        while total_sent < len(compressed_data):
            chunk_end = min(total_sent + chunk_size, len(compressed_data))
            chunk = compressed_data[total_sent:chunk_end]
            
            try:
                bytes_sent = tcp_socket.send(chunk)
                if bytes_sent == 0:
                    log_message("Socket connection broken during send", "ERROR")
                    return False
                total_sent += bytes_sent
                log_message(f"Sent chunk: {bytes_sent} bytes ({total_sent}/{len(compressed_data)})", "DEBUG")
            except Exception as e:
                log_message(f"Failed to send data chunk: {str(e)}", "ERROR")
                return False

        if total_sent != len(compressed_data):
            log_message(f"Incomplete send: {total_sent}/{len(compressed_data)} bytes", "ERROR")
            return False

        log_message(f"Successfully sent {total_sent} compressed bytes", "DEBUG")
        return True
        
    except Exception as e:
        log_message(f"Critical error in send_data: {str(e)}", "ERROR")
        return False


def extract_texture_data(socket):
    """Extract texture data from a node socket with caching"""
    global texture_cache, sync_stats
    
    if socket.is_linked:
        linked_node = socket.links[0].from_node
        if linked_node.type == 'TEX_IMAGE' and linked_node.image:
            try:
                image = linked_node.image
                log_message(f"TEXTURE: Processing image '{image.name}'", "DEBUG")
                
                # Determine cache key and image source
                cache_key = None
                image_data = None
                
                if image.packed_file:
                    # Image is packed in .blend file - use image name + size as cache key
                    cache_key = f"packed:{image.name}:{len(image.packed_file.data)}"
                    
                    # Check cache first
                    if cache_key in texture_cache:
                        cached_data = texture_cache[cache_key]
                        log_message(f"TEXTURE: Using cached packed image '{image.name}' (hash: {cached_data.get('hash', 'unknown')[:8]}...)", "DEBUG")
                        log_message(f"TEXTURE: Cached data type: {type(cached_data)}, keys: {list(cached_data.keys()) if isinstance(cached_data, dict) else 'not dict'}", "DEBUG")
                        sync_stats["textures_cached"] = sync_stats.get("textures_cached", 0) + 1
                        # Ensure we return a valid texture data structure
                        if isinstance(cached_data, dict) and 'name' in cached_data and 'hash' in cached_data:
                            log_message(f"TEXTURE: About to return cached texture_data: {cached_data}", "DEBUG")
                            return cached_data
                        else:
                            log_message(f"TEXTURE: Invalid cached data structure, re-processing texture", "WARNING")
                            log_message(f"TEXTURE: Invalid cached data was: {cached_data}", "DEBUG")
                            # Remove invalid cache entry and continue to re-process
                            del texture_cache[cache_key]
                    
                    log_message(f"TEXTURE: Image '{image.name}' is packed, extracting data", "DEBUG")
                    image_data = image.packed_file.data[:]
                    
                elif image.filepath:
                    # Image is external file
                    import os
                    
                    # Get absolute path
                    if image.filepath.startswith('//'):
                        # Relative path in Blender
                        blend_file = bpy.data.filepath
                        if blend_file:
                            blend_dir = os.path.dirname(blend_file)
                            image_path = os.path.join(blend_dir, image.filepath[2:])
                        else:
                            log_message(f"TEXTURE: Cannot resolve relative path '{image.filepath}' - blend file not saved", "WARNING")
                            return {"name": image.name, "filepath": image.filepath, "error": "relative_path_no_blend"}
                    else:
                        image_path = os.path.abspath(image.filepath)
                    
                    # Use file-based cache key (path + size + mtime)
                    cache_key = get_file_cache_key(image_path)
                    
                    # Check cache first
                    if cache_key in texture_cache:
                        cached_data = texture_cache[cache_key]
                        log_message(f"TEXTURE: Using cached file '{image.name}' from '{image_path}' (hash: {cached_data.get('hash', 'unknown')[:8]}...)", "DEBUG")
                        log_message(f"TEXTURE: Cached data type: {type(cached_data)}, keys: {list(cached_data.keys()) if isinstance(cached_data, dict) else 'not dict'}", "DEBUG")
                        sync_stats["textures_cached"] = sync_stats.get("textures_cached", 0) + 1
                        # Ensure we return a valid texture data structure
                        if isinstance(cached_data, dict) and 'name' in cached_data and 'hash' in cached_data:
                            log_message(f"TEXTURE: About to return cached texture_data: {cached_data}", "DEBUG")
                            return cached_data
                        else:
                            log_message(f"TEXTURE: Invalid cached data structure, re-processing texture", "WARNING")
                            log_message(f"TEXTURE: Invalid cached data was: {cached_data}", "DEBUG")
                            # Remove invalid cache entry and continue to re-process
                            del texture_cache[cache_key]
                    
                    log_message(f"TEXTURE: Reading external file '{image_path}' (not in cache)", "DEBUG")
                    
                    if os.path.exists(image_path):
                        try:
                            with open(image_path, 'rb') as f:
                                image_data = f.read()
                            log_message(f"TEXTURE: Successfully read {len(image_data)} bytes from '{image_path}'", "DEBUG")
                        except Exception as e:
                            log_message(f"TEXTURE: Failed to read file '{image_path}': {str(e)}", "ERROR")
                            return {"name": image.name, "filepath": image.filepath, "error": str(e)}
                    else:
                        log_message(f"TEXTURE: File not found: '{image_path}'", "ERROR")
                        return {"name": image.name, "filepath": image.filepath, "error": "file_not_found"}
                else:
                    log_message(f"TEXTURE: Image '{image.name}' has no file path", "WARNING")
                    return {"name": image.name, "error": "no_filepath"}
                
                if image_data and cache_key:
                    import base64
                    
                    # Encode to base64
                    base64_data = base64.b64encode(image_data).decode('utf-8')
                    
                    # Detect image format from file extension or image data
                    format_extension = image.name.lower().split('.')[-1] if '.' in image.name else 'png'
                    if format_extension in ['jpg', 'jpeg']:
                        mime_type = 'image/jpeg'
                    elif format_extension == 'png':
                        mime_type = 'image/png'
                    elif format_extension in ['bmp']:
                        mime_type = 'image/bmp'
                    elif format_extension in ['tga']:
                        mime_type = 'image/tga'
                    else:
                        mime_type = 'image/png'  # default
                    
                    data_url = f"data:{mime_type};base64,{base64_data}"
                    
                    # Create texture data
                    texture_data = {
                        "name": image.name,
                        "data": data_url,
                        "size": len(image_data),
                        "format": format_extension,
                        "hash": calculate_fast_hash(image_data)
                    }
                    
                    # Cache the result
                    texture_cache[cache_key] = texture_data
                    sync_stats["textures_sent"] = sync_stats.get("textures_sent", 0) + 1
                    
                    log_message(f"TEXTURE: Encoded and cached '{image.name}' as base64 ({len(base64_data)} chars, {mime_type}, hash: {texture_data['hash'][:8]}...)", "DEBUG")
                    log_message(f"TEXTURE: Cache stats - Cached: {sync_stats.get('textures_cached', 0)}, Sent: {sync_stats.get('textures_sent', 0)}", "DEBUG")
                    log_message(f"TEXTURE: Cache key '{cache_key}' stored with keys: {list(texture_data.keys())}", "DEBUG")
                    log_message(f"TEXTURE: About to return texture_data: {texture_data}", "DEBUG")
                    
                    return texture_data
                    
            except Exception as e:
                log_message(f"TEXTURE: Failed to extract texture data: {str(e)}", "ERROR")
                log_message(f"TEXTURE: Exception type: {type(e)}", "ERROR")
                log_message(f"TEXTURE: Exception args: {e.args}", "ERROR")
                import traceback
                log_message(traceback.format_exc(), "ERROR")
                error_result = {"name": image.name if 'image' in locals() else 'unknown', "error": str(e)}
                log_message(f"TEXTURE: Returning error result: {error_result}", "ERROR")
                return error_result
    return None

def extract_material_data(material):
    """Extract material properties for web sync"""
    if not material:
        log_message("MATERIAL: No material provided, using default", "DEBUG")
        return {
            "name": "Default",
            "type": "standard",
            "color": [0.8, 0.8, 0.8],
            "roughness": 0.7,
            "metalness": 0.3,
            "emission": [0.0, 0.0, 0.0],
            "emissionStrength": 0.0,
            "transparency": 0.0,
            "ior": 1.45,
            "normalStrength": 1.0
        }
    
    log_message(f"MATERIAL: Processing material '{material.name}'", "DEBUG")
    
    material_data = {
        "name": material.name,
        "type": "standard",
        "color": [0.8, 0.8, 0.8],
        "roughness": 0.7,
        "metalness": 0.3,
        "emission": [0.0, 0.0, 0.0],
        "emissionStrength": 0.0,
        "transparency": 0.0,
        "ior": 1.45,
        "normalStrength": 1.0
    }
    
    # Check if material uses nodes (Principled BSDF)
    if material.use_nodes and material.node_tree:
        log_message(f"MATERIAL: '{material.name}' uses nodes, searching for Principled BSDF", "DEBUG")
        # Initialize textures dict
        textures = {}
        
        principled_found = False
        for node in material.node_tree.nodes:
            if node.type == 'BSDF_PRINCIPLED':
                principled_found = True
                log_message(f"MATERIAL: Found Principled BSDF node in '{material.name}'", "DEBUG")
                # Extract base color
                if 'Base Color' in node.inputs:
                    base_color_socket = node.inputs['Base Color']
                    if base_color_socket.is_linked:
                        log_message(f"MATERIAL: '{material.name}' Base Color is linked to texture", "DEBUG")
                        # Check for texture
                        texture_data = extract_texture_data(base_color_socket)
                        if texture_data:
                            log_message(f"MATERIAL: extract_texture_data returned: {texture_data}", "DEBUG")
                            textures["diffuse"] = texture_data
                            log_message(f"MATERIAL: '{material.name}' diffuse texture: {texture_data['name']}", "DEBUG")
                        else:
                            log_message(f"MATERIAL: '{material.name}' Base Color linked but no texture found", "WARNING")
                    else:
                        base_color = base_color_socket.default_value
                        material_data["color"] = [base_color[0], base_color[1], base_color[2]]
                        log_message(f"MATERIAL: '{material.name}' Base Color: {material_data['color']}", "DEBUG")
                
                # Extract roughness
                if 'Roughness' in node.inputs:
                    roughness_socket = node.inputs['Roughness']
                    if roughness_socket.is_linked:
                        texture_data = extract_texture_data(roughness_socket)
                        if texture_data:
                            textures["roughness"] = texture_data
                            log_message(f"MATERIAL: '{material.name}' roughness texture: {texture_data['name']}", "DEBUG")
                    else:
                        material_data["roughness"] = roughness_socket.default_value
                        log_message(f"MATERIAL: '{material.name}' Roughness: {material_data['roughness']}", "DEBUG")
                
                # Extract metallic
                if 'Metallic' in node.inputs:
                    metallic_socket = node.inputs['Metallic']
                    if metallic_socket.is_linked:
                        texture_data = extract_texture_data(metallic_socket)
                        if texture_data:
                            textures["metalness"] = texture_data
                            log_message(f"MATERIAL: '{material.name}' metalness texture: {texture_data['name']}", "DEBUG")
                    else:
                        material_data["metalness"] = metallic_socket.default_value
                        log_message(f"MATERIAL: '{material.name}' Metallic: {material_data['metalness']}", "DEBUG")
                
                # Extract normal map
                if 'Normal' in node.inputs:
                    normal_socket = node.inputs['Normal']
                    if normal_socket.is_linked:
                        # Check if it's connected to a normal map node
                        linked_node = normal_socket.links[0].from_node
                        if linked_node.type == 'NORMAL_MAP':
                            color_socket = linked_node.inputs.get('Color')
                            if color_socket and color_socket.is_linked:
                                texture_data = extract_texture_data(color_socket)
                                if texture_data:
                                    textures["normal"] = texture_data
                                    material_data["normalStrength"] = linked_node.inputs.get('Strength', type(None)).default_value if linked_node.inputs.get('Strength') else 1.0
                
                # Extract emission
                if 'Emission' in node.inputs:
                    emission_socket = node.inputs['Emission']
                    if emission_socket.is_linked:
                        texture_data = extract_texture_data(emission_socket)
                        if texture_data:
                            textures["emission"] = texture_data
                    else:
                        emission = emission_socket.default_value
                        material_data["emission"] = [emission[0], emission[1], emission[2]]
                        
                if 'Emission Strength' in node.inputs:
                    material_data["emissionStrength"] = node.inputs['Emission Strength'].default_value
                    
                # Set type based on emission
                if material_data["emissionStrength"] > 0:
                    material_data["type"] = "emission"
                
                # Extract transparency/transmission
                if 'Transmission' in node.inputs:
                    transmission = node.inputs['Transmission'].default_value
                    if transmission > 0:
                        material_data["type"] = "glass"
                        material_data["transparency"] = transmission
                
                if 'Alpha' in node.inputs:
                    alpha = node.inputs['Alpha'].default_value
                    if alpha < 1.0:
                        material_data["type"] = "transparent"
                        material_data["transparency"] = 1.0 - alpha
                
                # Extract IOR
                if 'IOR' in node.inputs:
                    material_data["ior"] = node.inputs['IOR'].default_value
                
                # Extract clearcoat
                if 'Clearcoat' in node.inputs:
                    clearcoat = node.inputs['Clearcoat'].default_value
                    if clearcoat > 0:
                        material_data["clearcoat"] = clearcoat
                        if 'Clearcoat Roughness' in node.inputs:
                            material_data["clearcoatRoughness"] = node.inputs['Clearcoat Roughness'].default_value
                
                # Add textures if any were found
                if textures:
                    material_data["textures"] = textures
                    log_message(f"MATERIAL: '{material.name}' has {len(textures)} textures: {list(textures.keys())}", "DEBUG")
                else:
                    log_message(f"MATERIAL: '{material.name}' has no textures", "DEBUG")
                
                break
        
        if not principled_found:
            log_message(f"MATERIAL: '{material.name}' - No Principled BSDF found in node tree", "WARNING")
    else:
        log_message(f"MATERIAL: '{material.name}' does not use nodes, using legacy properties", "DEBUG")
        # Fallback to legacy material properties
        if hasattr(material, 'diffuse_color'):
            material_data["color"] = [material.diffuse_color[0], material.diffuse_color[1], material.diffuse_color[2]]
            log_message(f"MATERIAL: '{material.name}' legacy diffuse color: {material_data['color']}", "DEBUG")
        if hasattr(material, 'roughness'):
            material_data["roughness"] = material.roughness
            log_message(f"MATERIAL: '{material.name}' legacy roughness: {material_data['roughness']}", "DEBUG")
        if hasattr(material, 'metallic'):
            material_data["metalness"] = material.metallic
            log_message(f"MATERIAL: '{material.name}' legacy metallic: {material_data['metalness']}", "DEBUG")
    
    log_message(f"MATERIAL: Final data for '{material.name}': type={material_data['type']}, color={material_data['color']}, roughness={material_data['roughness']}, metalness={material_data['metalness']}", "DEBUG")
    return material_data


def extract_light_data():
    """Extract light data from the scene"""
    lights_data = []
    
    for obj in bpy.context.scene.objects:
        if obj.type == 'LIGHT':
            light = obj.data
            
            # Convert Blender light type to our format
            light_type_map = {
                'SUN': 'sun',
                'POINT': 'point',
                'SPOT': 'spot',
                'AREA': 'area'
            }
            
            light_data = {
                "name": obj.name,
                "type": light_type_map.get(light.type, 'point'),
                "position": [obj.location.x, obj.location.y, obj.location.z],
                "rotation": [obj.rotation_euler.x, obj.rotation_euler.y, obj.rotation_euler.z],
                "color": [light.color[0], light.color[1], light.color[2]],
                "energy": light.energy
            }
            
            # Add type-specific properties
            if light.type == 'SPOT':
                light_data["angle"] = light.spot_size
                light_data["blend"] = light.spot_blend
            elif light.type == 'AREA':
                light_data["size"] = light.size
            
            # Add distance for point and spot lights
            if light.type in ['POINT', 'SPOT'] and hasattr(light, 'distance'):
                light_data["distance"] = light.distance
            
            lights_data.append(light_data)
    
    return lights_data


def extract_world_data():
    """Extract world/environment data"""
    world = bpy.context.scene.world
    
    world_data = {
        "backgroundColor": [0.05, 0.05, 0.05],  # Default dark background
        "ambientColor": [1.0, 1.0, 1.0],
        "ambientStrength": 0.1
    }
    
    if world:
        # Extract world color from shader nodes
        if world.use_nodes and world.node_tree:
            for node in world.node_tree.nodes:
                if node.type == 'BACKGROUND':
                    if 'Color' in node.inputs:
                        bg_color = node.inputs['Color'].default_value
                        world_data["backgroundColor"] = [bg_color[0], bg_color[1], bg_color[2]]
                    if 'Strength' in node.inputs:
                        world_data["ambientStrength"] = node.inputs['Strength'].default_value * 0.1
                    break
        else:
            # Fallback to legacy world color
            if hasattr(world, 'color'):
                world_data["backgroundColor"] = [world.color[0], world.color[1], world.color[2]]
    
    return world_data


def send_mesh_data():
    """Function to send mesh data with materials and lighting"""
    global is_server_running, last_data

    if not is_server_running:
        return

    try:
        for window in bpy.context.window_manager.windows:
            screen = window.screen
            for area in screen.areas:
                if area.type == "VIEW_3D":
                    # Get all visible mesh objects
                    all_objects = [obj for obj in window.view_layer.objects]
                    mesh_objects = [
                        obj
                        for obj in all_objects
                        if obj.type == "MESH" and obj.visible_get()
                    ]

                    log_message(f"DEBUG: Total objects in scene: {len(all_objects)}")
                    log_message(f"DEBUG: Mesh objects found: {len(mesh_objects)}")
                    for obj in mesh_objects:
                        log_message(
                            f"DEBUG: Found mesh object: {obj.name} (visible: {obj.visible_get()})"
                        )

                    if not mesh_objects:
                        log_message("No visible mesh objects", "WARNING")
                        break

                    log_message(f"Processing {len(mesh_objects)} mesh objects")

                    # Create scene data structure
                    scene_objects = []
                    depsgraph = window.view_layer.depsgraph

                    for obj in mesh_objects:
                        log_message(f"  Processing object: {obj.name}")

                        # Ensure mesh data is up to date
                        obj_eval = obj.evaluated_get(depsgraph)
                        mesh = obj_eval.to_mesh()

                        # Triangulate mesh
                        import bmesh

                        bm = bmesh.new()
                        bm.from_mesh(mesh)
                        bmesh.ops.triangulate(bm, faces=bm.faces)
                        bm.to_mesh(mesh)
                        bm.free()

                        log_message(
                            f"    Vertices: {len(mesh.vertices)}, Faces: {len(mesh.polygons)}"
                        )

                        # For proper UV mapping, we need to create unique vertices for each face corner
                        # This is because Blender stores UVs per-loop, not per-vertex
                        
                        vertices = []
                        faces = []
                        uvs = []
                        has_uvs = False
                        
                        if mesh.uv_layers.active:
                            has_uvs = True
                            uv_layer = mesh.uv_layers.active.data
                            log_message(f"OBJECT: '{obj.name}' has UV layer '{mesh.uv_layers.active.name}'", "DEBUG")
                            
                            # Create vertices and UVs per face corner (loop)
                            vertex_index = 0
                            face_count = 0
                            
                            for poly in mesh.polygons:
                                if len(poly.vertices) == 3:  # Only process triangles
                                    face_indices = []
                                    face_uvs = []
                                    
                                    for loop_index in range(poly.loop_start, poly.loop_start + poly.loop_total):
                                        loop = mesh.loops[loop_index]
                                        vertex = mesh.vertices[loop.vertex_index]
                                        uv_coord = uv_layer[loop_index].uv
                                        
                                        # Keep vertex in local coordinates for proper transform matrix application
                                        co = vertex.co
                                        vertices.append([co.x, co.y, co.z])
                                        
                                        # Store UV coordinate
                                        uvs.append([uv_coord.x, uv_coord.y])
                                        face_uvs.append([uv_coord.x, uv_coord.y])
                                        
                                        # Add to face
                                        face_indices.append(vertex_index)
                                        vertex_index += 1
                                    
                                    faces.append(face_indices)
                                    
                                    # Debug first few faces
                                    if face_count < 6:
                                        log_message(f"OBJECT: '{obj.name}' face {face_count}: vertices {face_indices}, UVs {face_uvs}", "DEBUG")
                                    face_count += 1
                            
                            log_message(f"OBJECT: '{obj.name}' created {len(vertices)} unique vertices with UVs from {len(mesh.polygons)} faces", "DEBUG")
                            log_message(f"OBJECT: '{obj.name}' extracted {len(uvs)} UV coordinates", "DEBUG")
                        else:
                            log_message(f"OBJECT: '{obj.name}' has no UV coordinates, using simple vertex mapping", "WARNING")
                            
                            # Fallback: simple vertex mapping without UVs
                            for v in mesh.vertices:
                                co = v.co
                                vertices.append([co.x, co.y, co.z])

                            for p in mesh.polygons:
                                if len(p.vertices) == 3:  # Only process triangles
                                    faces.append([p.vertices[0], p.vertices[1], p.vertices[2]])

                        # Extract materials
                        materials = []
                        if obj.material_slots:
                            log_message(f"OBJECT: '{obj.name}' has {len(obj.material_slots)} material slots", "DEBUG")
                            for i, slot in enumerate(obj.material_slots):
                                log_message(f"OBJECT: '{obj.name}' slot {i}: {slot.material.name if slot.material else 'None'}", "DEBUG")
                                materials.append(extract_material_data(slot.material))
                        else:
                            log_message(f"OBJECT: '{obj.name}' has no material slots, using default", "DEBUG")
                            materials.append(extract_material_data(None))

                        # Create object data
                        object_data = {
                            "name": obj.name,
                            "vertices": vertices,
                            "faces": faces,
                            "transform": [list(row) for row in obj.matrix_world],
                            "materials": materials
                        }
                        
                        
                        # Add UV coordinates if available
                        if has_uvs and uvs:
                            object_data["uvs"] = uvs
                            log_message(f"OBJECT: '{obj.name}' included {len(uvs)} UV coordinates in data", "DEBUG")
                        else:
                            log_message(f"OBJECT: '{obj.name}' no UV coordinates to include", "DEBUG")

                        scene_objects.append(object_data)

                        # Clean up temporary mesh
                        obj_eval.to_mesh_clear()

                    # Extract lighting data
                    lights_data = extract_light_data()
                    log_message(f"DEBUG: Found {len(lights_data)} lights")

                    # Extract world data
                    world_data = extract_world_data()

                    # Create complete scene data
                    scene_data = {
                        "objects": scene_objects,
                        "lights": lights_data,
                        "world": world_data
                    }

                    log_message(f"DEBUG: Scene data contains:")
                    log_message(f"DEBUG: - Objects: {len(scene_objects)}")
                    log_message(f"DEBUG: - Lights: {len(lights_data)}")
                    log_message(f"DEBUG: - World data: {bool(world_data)}")

                    # Convert data to JSON string
                    data_str = json.dumps(scene_data)
                    data_size = len(data_str.encode())

                    # Send if data is different from last time
                    if data_str != last_data:
                        log_message(
                            f"Preparing to send scene data with materials and lighting, size: {format_bytes(data_size)}"
                        )
                        if send_data(data_str):
                            last_data = data_str
                            update_sync_stats(data_size)
                            log_message("Scene data with materials and lighting sent successfully")
                    else:
                        log_message("Scene data unchanged, skipping send")
                    break
            break
    except Exception as e:
        error_msg = f"Error sending data: {str(e)}"
        log_message(error_msg, "ERROR")
        update_sync_stats(is_error=True)
        import traceback

        log_message(traceback.format_exc(), "ERROR")


class WebSyncSettings(bpy.types.PropertyGroup):
    is_running: bpy.props.BoolProperty(name="Sync Active", default=False)
    port: bpy.props.IntProperty(name="Port", default=10006)
    show_stats: bpy.props.BoolProperty(name="Show Statistics", default=True)
    show_received_data: bpy.props.BoolProperty(name="Show Received Data", default=True)
    update_frequency: bpy.props.IntProperty(name="Update Frequency (Hz)", default=10, min=1, max=60, description="How often to send updates to web client")


class StartWebSyncServer(bpy.types.Operator):
    bl_idname = "web_sync.start_server"
    bl_label = "Start Sync"

    def execute(self, context):
        global tcp_socket, is_server_running, receive_thread, stop_receive_thread

        if not is_server_running:
            try:
                log_message("Connecting to server...")
                tcp_socket = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
                tcp_socket.settimeout(1.0)  # Set timeout for receive operations
                tcp_socket.connect(("localhost", context.scene.web_sync_settings.port))
                is_server_running = True
                context.scene.web_sync_settings.is_running = True

                # Reset statistics
                global sync_stats, received_transform_data
                sync_stats = {
                    "start_time": time.time(),
                    "packets_sent": 0,
                    "bytes_sent": 0,
                    "last_sync_time": None,
                    "sync_rate": 0,
                    "errors": 0,
                    "textures_cached": 0,
                    "textures_sent": 0,
                }
                
                # Reset received data tracking
                received_transform_data = {
                    "last_received": None,
                    "object_name": "",
                    "position": [0, 0, 0],
                    "rotation": [0, 0, 0],
                    "scale": [1, 1, 1],
                    "timestamp": "",
                    "total_received": 0
                }
                
                # Reset anti-feedback protection
                global is_applying_external_transform, external_transform_cooldown_end, last_applied_transform
                is_applying_external_transform = False
                external_transform_cooldown_end = 0
                last_applied_transform = None

                # Start receive thread for bidirectional communication
                stop_receive_thread = False
                receive_thread = threading.Thread(target=receive_messages, daemon=True)
                receive_thread.start()

                log_message("Connected to server with bidirectional communication")

            except Exception as e:
                error_msg = f"Failed to connect to server: {str(e)}"
                log_message(error_msg, "ERROR")
                self.report({"ERROR"}, error_msg)
                return {"CANCELLED"}

        return {"FINISHED"}


class StopWebSyncServer(bpy.types.Operator):
    bl_idname = "web_sync.stop_server"
    bl_label = "Stop Sync"

    def execute(self, context):
        global tcp_socket, is_server_running, receive_thread, stop_receive_thread

        log_message("Disconnecting...")
        is_server_running = False
        context.scene.web_sync_settings.is_running = False
        
        # Stop receive thread
        stop_receive_thread = True
        if receive_thread and receive_thread.is_alive():
            receive_thread.join(timeout=2.0)

        if tcp_socket:
            tcp_socket.close()
            tcp_socket = None

        log_message("Disconnected")
        log_message("\n=== Sync Statistics ===\n" + get_sync_stats())
        return {"FINISHED"}


class WebSyncPanel(bpy.types.Panel):
    bl_label = "Web Sync"
    bl_idname = "VIEW3D_PT_web_sync"
    bl_space_type = "VIEW_3D"
    bl_region_type = "UI"
    bl_category = "Web Sync"

    def draw(self, context):
        layout = self.layout
        settings = context.scene.web_sync_settings

        layout.prop(settings, "port")
        layout.prop(settings, "update_frequency")
        layout.prop(settings, "show_stats")
        layout.prop(settings, "show_received_data")

        if not settings.is_running:
            layout.operator("web_sync.start_server")
        else:
            layout.operator("web_sync.stop_server")

            if settings.show_stats:
                box = layout.box()
                box.label(text="Sync Statistics", icon="INFO")
                for line in get_sync_stats().split("\n"):
                    box.label(text=line)
            
            if settings.show_received_data:
                box = layout.box()
                box.label(text="Received Transform Data", icon="IMPORT")
                for line in get_received_data_info().split("\n"):
                    box.label(text=line)


@persistent
def load_handler(dummy):
    global tcp_socket, is_server_running, stop_receive_thread
    is_server_running = False
    stop_receive_thread = True
    if tcp_socket:
        tcp_socket.close()
        tcp_socket = None
    if hasattr(bpy.context.scene, "web_sync_settings"):
        bpy.context.scene.web_sync_settings.is_running = False
    log_message("Scene loaded, sync server reset")


@persistent
def depsgraph_update_handler(scene, depsgraph):
    """Handler function for scene updates with anti-feedback protection and throttling"""
    global is_applying_external_transform, external_transform_cooldown_end, last_depsgraph_sync_time
    
    if not is_server_running:
        return
    
    # Check if we're currently applying an external transform
    if is_applying_external_transform:
        log_message("⏸️ Skipping mesh sync - currently applying external transform to prevent feedback")
        return
    
    # Check if we're still in cooldown period
    current_time = time.time()
    if current_time < external_transform_cooldown_end:
        remaining_cooldown = external_transform_cooldown_end - current_time
        log_message(f"⏸️ Skipping mesh sync - in cooldown period ({remaining_cooldown:.2f}s remaining)")
        return
    
    # Get update frequency from settings
    settings = bpy.context.scene.web_sync_settings
    update_frequency = getattr(settings, 'update_frequency', 10)  # Default to 10Hz
    min_interval = 1.0 / update_frequency  # Convert Hz to seconds
    
    # Check throttling
    time_since_last_sync = current_time - last_depsgraph_sync_time
    if time_since_last_sync < min_interval:
        remaining_wait = min_interval - time_since_last_sync
        log_message(f"⏳ Throttling mesh sync - waiting {remaining_wait:.3f}s ({update_frequency}Hz limit)")
        return
    
    # Normal mesh sync
    last_depsgraph_sync_time = current_time
    log_message(f"📡 Sending mesh update ({update_frequency}Hz throttle)")
    send_mesh_data()


@persistent 
def frame_change_handler(scene, depsgraph):
    """Handler function for animation frame changes with anti-feedback protection"""
    global last_frame_sync_time, is_applying_external_transform, external_transform_cooldown_end
    
    if not is_server_running:
        return
    
    # Check anti-feedback protection
    if is_applying_external_transform:
        log_message("⏸️ Skipping frame sync - currently applying external transform to prevent feedback")
        return
    
    current_time = time.time()
    if current_time < external_transform_cooldown_end:
        remaining_cooldown = external_transform_cooldown_end - current_time
        log_message(f"⏸️ Skipping frame sync - in cooldown period ({remaining_cooldown:.2f}s remaining)")
        return
    
    # Throttle updates to prevent excessive network traffic
    if current_time - last_frame_sync_time >= frame_sync_throttle:
        log_message(f"Animation frame changed to: {scene.frame_current}")
        send_mesh_data()
        last_frame_sync_time = current_time
    else:
        log_message(f"Frame change throttled (frame {scene.frame_current})")  


classes = (
    WebSyncSettings,
    WebSyncPanel,
    StartWebSyncServer,
    StopWebSyncServer,
)


def register():
    for cls in classes:
        bpy.utils.register_class(cls)
    bpy.types.Scene.web_sync_settings = bpy.props.PointerProperty(type=WebSyncSettings)
    bpy.app.handlers.load_post.append(load_handler)
    if depsgraph_update_handler not in bpy.app.handlers.depsgraph_update_post:
        bpy.app.handlers.depsgraph_update_post.append(depsgraph_update_handler)
    if frame_change_handler not in bpy.app.handlers.frame_change_post:
        bpy.app.handlers.frame_change_post.append(frame_change_handler)
    log_message("Plugin registered")


def unregister():
    global is_server_running, tcp_socket, stop_receive_thread
    is_server_running = False
    stop_receive_thread = True
    if tcp_socket:
        tcp_socket.close()
        tcp_socket = None

    if depsgraph_update_handler in bpy.app.handlers.depsgraph_update_post:
        bpy.app.handlers.depsgraph_update_post.remove(depsgraph_update_handler)
    if frame_change_handler in bpy.app.handlers.frame_change_post:
        bpy.app.handlers.frame_change_post.remove(frame_change_handler)

    for cls in reversed(classes):
        bpy.utils.unregister_class(cls)
    del bpy.types.Scene.web_sync_settings
    bpy.app.handlers.load_post.remove(load_handler)
    log_message("Plugin unregistered")


if __name__ == "__main__":
    register()
