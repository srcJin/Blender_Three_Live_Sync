'use client'

interface ControlButtonsProps {
  onResetView: () => void;
  onToggleWireframe: () => void;
  onToggleAutoRotate: () => void;
  onToggleGrid: () => void;
  onToggleEditMode: () => void;
  isWireframe: boolean;
  isAutoRotating: boolean;
  autoRotateSpeed: number;
  setAutoRotateSpeed: (speed: number) => void;
  showGrid: boolean;
  isEditMode: boolean;
  gizmoMode: 'translate' | 'rotate' | 'scale';
  setGizmoMode: (mode: 'translate' | 'rotate' | 'scale') => void;
}

export default function ControlButtons({
  onResetView,
  onToggleWireframe,
  onToggleAutoRotate,
  onToggleGrid,
  onToggleEditMode,
  isWireframe,
  isAutoRotating,
  autoRotateSpeed,
  setAutoRotateSpeed,
  showGrid,
  isEditMode,
  gizmoMode,
  setGizmoMode,
}: ControlButtonsProps) {
  return (
    <div className="control-buttons">
      {/* Main View Controls */}
      <div className="button-group">
        <button 
          className="control-button"
          onClick={() => {
            console.log('🔍 Reset View button clicked! Function type:', typeof onResetView)
            if (typeof onResetView === 'function') {
              onResetView()
            } else {
              console.error('❌ onResetView is not a function:', onResetView)
            }
          }}
          title="Reset Camera View"
          data-tooltip="Reset View"
        >
          <span className="material-icons">center_focus_strong</span>
        </button>

        <button 
          className={`control-button ${isWireframe ? 'active' : ''}`}
          onClick={() => {
            console.log('🔍 Wireframe button clicked! Function type:', typeof onToggleWireframe)
            if (typeof onToggleWireframe === 'function') {
              onToggleWireframe()
            } else {
              console.error('❌ onToggleWireframe is not a function:', onToggleWireframe)
            }
          }}
          title="Toggle Wireframe Mode"
          data-tooltip="Wireframe"
        >
          <span className="material-icons">grid_4x4</span>
        </button>

        <button 
          className={`control-button ${isAutoRotating ? 'active' : ''}`}
          onClick={onToggleAutoRotate}
          title="Toggle Auto Rotate"
          data-tooltip="Auto Rotate"
        >
          <span className="material-icons">rotate_right</span>
        </button>

        <button 
          className={`control-button ${showGrid ? 'active' : ''}`}
          onClick={onToggleGrid}
          title="Toggle Grid Display"
          data-tooltip="Show Grid"
        >
          <span className="material-icons">grid_on</span>
        </button>

        <button 
          className={`control-button ${isEditMode ? 'active' : ''}`}
          onClick={onToggleEditMode}
          title="Toggle Edit Mode - Click objects to select and transform"
          data-tooltip="Edit Mode"
        >
          <span className="material-icons">edit</span>
        </button>
      </div>

      {/* Gizmo Controls - only show when in edit mode */}
      {isEditMode && (
        <div className="button-group gizmo-group">
          <div className="group-separator"></div>
          
          <button
            className={`control-button ${gizmoMode === 'translate' ? 'active' : ''}`}
            onClick={() => setGizmoMode('translate')}
            title="Translate Tool (Move) - W key"
            data-tooltip="Move"
          >
            <span className="material-icons">open_with</span>
          </button>
          
          <button
            className={`control-button ${gizmoMode === 'rotate' ? 'active' : ''}`}
            onClick={() => setGizmoMode('rotate')}
            title="Rotate Tool - E key"
            data-tooltip="Rotate"
          >
            <span className="material-icons">rotate_90_degrees_ccw</span>
          </button>
          
          <button
            className={`control-button ${gizmoMode === 'scale' ? 'active' : ''}`}
            onClick={() => setGizmoMode('scale')}
            title="Scale Tool (Resize) - R key"
            data-tooltip="Scale"
          >
            <span className="material-icons">aspect_ratio</span>
          </button>
        </div>
      )}
    </div>
  );
}