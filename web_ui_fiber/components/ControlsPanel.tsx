'use client'

interface ControlsPanelProps {
  onResetView: () => void;
  onToggleWireframe: () => void;
  onToggleAutoRotate: () => void;
  onToggleGrid: () => void;
  onToggleEditMode: () => void;
  isWireframe: boolean;
  isAutoRotating: boolean;
  showGrid: boolean;
  isEditMode: boolean;
  gizmoMode: 'translate' | 'rotate' | 'scale';
  setGizmoMode: (mode: 'translate' | 'rotate' | 'scale') => void;
  updateFrequency: number;
  setUpdateFrequency: (freq: number) => void;
  smoothReceiving: boolean;
  setSmoothReceiving: (smooth: boolean) => void;
}

export default function ControlsPanel({
  onResetView,
  onToggleWireframe,
  onToggleAutoRotate,
  onToggleGrid,
  onToggleEditMode,
  isWireframe,
  isAutoRotating,
  showGrid,
  isEditMode,
  gizmoMode,
  setGizmoMode,
  updateFrequency,
  setUpdateFrequency,
  smoothReceiving,
  setSmoothReceiving,
}: ControlsPanelProps) {
  return (
    <div className="controls-panel">
      <button 
        className="control-button"
        onClick={onResetView}
        title="Reset View"
      >
        <span className="material-icons">center_focus_strong</span>
      </button>

      <button 
        className={`control-button ${isWireframe ? 'active' : ''}`}
        onClick={onToggleWireframe}
        title="Toggle Wireframe"
      >
        <span className="material-icons">grid_4x4</span>
      </button>

      <button 
        className={`control-button ${isAutoRotating ? 'active' : ''}`}
        onClick={onToggleAutoRotate}
        title="Toggle Auto Rotate"
      >
        <span className="material-icons">rotate_right</span>
      </button>

      <button 
        className={`control-button ${showGrid ? 'active' : ''}`}
        onClick={onToggleGrid}
        title="Toggle Grid"
      >
        <span className="material-icons">grid_on</span>
      </button>

      <button 
        className={`control-button ${isEditMode ? 'active' : ''}`}
        onClick={onToggleEditMode}
        title="Toggle Edit Mode"
      >
        <span className="material-icons">edit</span>
      </button>

      {isEditMode && (
        <>
          <button
            className={`control-button ${gizmoMode === 'translate' ? 'active' : ''}`}
            onClick={() => setGizmoMode('translate')}
            title="Translate Tool"
          >
            <span className="material-icons">open_with</span>
          </button>
          <button
            className={`control-button ${gizmoMode === 'rotate' ? 'active' : ''}`}
            onClick={() => setGizmoMode('rotate')}
            title="Rotate Tool"
          >
            <span className="material-icons">rotate_right</span>
          </button>
          <button
            className={`control-button ${gizmoMode === 'scale' ? 'active' : ''}`}
            onClick={() => setGizmoMode('scale')}
            title="Scale Tool"
          >
            <span className="material-icons">aspect_ratio</span>
          </button>
        </>
      )}
      
      {/* Update Frequency Control */}
      <div className="frequency-control" style={{ 
        marginTop: '10px', 
        padding: '8px', 
        border: '1px solid #444', 
        borderRadius: '4px',
        backgroundColor: '#2a2a2a'
      }}>
        <label style={{ 
          display: 'block', 
          fontSize: '12px', 
          color: '#ccc', 
          marginBottom: '4px' 
        }}>
          Update Rate: {updateFrequency}Hz
        </label>
        <input
          type="range"
          min="1"
          max="60"
          step="1"
          value={updateFrequency}
          onChange={(e) => {
            const newFreq = Number(e.target.value)
            console.log('🎛️ ControlsPanel: Slider changed to', newFreq, 'Hz')
            setUpdateFrequency(newFreq)
          }}
          style={{ 
            width: '100%',
            marginBottom: '4px'
          }}
        />
        <div style={{ 
          display: 'flex', 
          justifyContent: 'space-between', 
          fontSize: '10px', 
          color: '#888' 
        }}>
          <span>1Hz</span>
          <span>60Hz</span>
        </div>
        
        {/* Smooth Receiving Toggle */}
        <label style={{ 
          display: 'flex', 
          alignItems: 'center', 
          fontSize: '12px', 
          color: '#ccc', 
          marginTop: '8px',
          cursor: 'pointer'
        }}>
          <input
            type="checkbox"
            checked={smoothReceiving}
            onChange={(e) => setSmoothReceiving(e.target.checked)}
            style={{ marginRight: '6px' }}
          />
          Smooth Receiving
        </label>
      </div>
    </div>
  );
}