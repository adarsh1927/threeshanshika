/**
 * Threeshanshika | A live shader inspector for Three.js
 *build 4
 * @author adarsh1927
 * @license MIT
 */

 // In threeshanshika/src/index.js
// --- FINAL, DEFINITIVE VERSION ---

import { WebGLRenderTarget, FloatType, Raycaster, Vector2, Layers } from 'three';
import { instrumentShader } from './core/GLSLInstrumenter.js';
import { Tooltip } from './ui/Tooltip.js';

const inspector = {
    // --- STATE & DEFAULTS ---
    _renderer: null, _camera: null, _scene: null, _tooltip: null, _isInitialized: false,
    _mrt: null, _capturedVarsByMaterial: new Map(),
    _debugDataBuffer: new Float32Array(4),
    _colorDataBuffer: new Float32Array(4),
    _originalRenderMethod: null,
    _raycaster: new Raycaster(), _mouse: new Vector2(),
    _lastTooltipX: 0, _lastTooltipY: 0,
    _debugLayer: new Layers(),

    // --- PUBLIC API ---

    init(renderer, scene, camera) {
        if (!renderer || !scene || !camera) {
            console.error("Threeshanshika: init() requires a renderer, scene, and camera."); return;
        }
        if (this._isInitialized) {
            console.warn("Threeshanshika: Inspector already initialized."); return;
        }
        this._renderer = renderer;
        this._scene = scene;
        this._camera = camera;
        this._isInitialized = true;
        this._tooltip = new Tooltip();
        this._debugLayer.set(31); // Use an uncommon layer for the debug pass
        this._addEventListeners();
        this._overrideRenderMethod();
        console.log("Threeshanshika Inspector: Initialized and ready.");
    },

    patch(material) {
        if (!material) { console.warn("Threeshanshika: patch() called with a null or undefined material."); return; }
        if (material.userData.isPatchedByInspector) { console.warn("Threeshanshika: Material already patched.", material); return; }
        this._applyPatch(material);
    },

    /**
     * Sets the raycasting threshold for THREE.Points objects.
     * This is ESSENTIAL for allowing the mouse to "hit" particles.
     * @param {number} threshold The distance in world units to consider a hit. A good default is 0.1.
     */
    setRaycastThreshold(threshold) {
        if (typeof threshold !== 'number') {
            console.error("Threeshanshika: setRaycastThreshold() expects a number.");
            return;
        }
        this._raycaster.params.Points.threshold = threshold;
    },

    // --- PRIVATE METHODS ---

    _applyPatch(material) {
        material.onBeforeCompile = (shader) => {
            const vsResult = instrumentShader(shader.vertexShader, 'vertex');
            const fsResult = instrumentShader(shader.fragmentShader, 'fragment');
            const allVars = [...vsResult.inspectedVars, ...fsResult.inspectedVars];
            if (allVars.length === 0) return;

            const allUsedSlots = [...new Set(allVars.map(v => v.slot))].sort((a,b)=>a-b);
            const vsUsedSlots = [...new Set(vsResult.inspectedVars.map(v => v.slot))].sort((a,b)=>a-b);

            let vertexDeclarations = '', fragmentDeclarations = '';
            for (const slot of vsUsedSlots) {
                const isFlat = vsResult.inspectedVars.find(v => v.slot === slot).isFlat;
                const varyingDecl = `${isFlat ? 'flat ' : ''}varying vec4 threeshanshika_v_debug_${slot};\n`;
                vertexDeclarations += varyingDecl;
                fragmentDeclarations += varyingDecl;
            }
            for (const slot of allUsedSlots) {
                fragmentDeclarations += `layout(location = ${slot + 1}) out vec4 threeshanshika_f_debug_${slot};\n`;
            }

            shader.vertexShader = vsResult.modifiedCode;
            shader.fragmentShader = fsResult.modifiedCode;

            if (vertexDeclarations) shader.vertexShader = shader.vertexShader.replace('void main()', vertexDeclarations + 'void main()');
            if (fragmentDeclarations) shader.fragmentShader = shader.fragmentShader.replace('void main()', fragmentDeclarations + 'void main()');
            
            const assignments = vsResult.fragmentVaryingAssignments;
            if (assignments) shader.fragmentShader = shader.fragmentShader.replace('void main() {', 'void main() {\n' + assignments);

            const sortedVars = allVars.sort((a, b) => a.slot - b.slot);
            this._capturedVarsByMaterial.set(material.uuid, sortedVars);
            const highestSlot = Math.max(...allUsedSlots);
            this._updateRenderTarget(highestSlot + 2);
        };
        material.needsUpdate = true;
        material.userData.isPatchedByInspector = true;
    },

    _render(scene, camera) {
        // Pass 1: Always render the full scene to the screen first.
        // This is CRITICAL. It triggers onBeforeCompile for any new materials,
        // which populates our _capturedVarsByMaterial map BEFORE we check it.
        this._renderer.setRenderTarget(null);
        this._originalRenderMethod(scene, camera);

        // Now that all materials are compiled and registered, we can safely check for intersections.
        this._raycaster.setFromCamera(this._mouse, camera);
        const intersects = this._raycaster.intersectObjects(scene.children, true);
        
        let hoveredObject = null;
        if (intersects.length > 0 && intersects[0].object.material && this._capturedVarsByMaterial.has(intersects[0].object.material.uuid)) {
            hoveredObject = intersects[0].object;
        }

        // Pass 2: If we are hovering over an inspectable object, perform the special debug render.
        if (hoveredObject) {
            const originalLayers = hoveredObject.layers.mask;
            const originalCameraLayers = camera.layers.mask;

            hoveredObject.layers.set(31);
            camera.layers.set(31);

            this._renderer.setRenderTarget(this._mrt);
            // We render again, this time to our off-screen target to capture debug data.
            this._originalRenderMethod(scene, camera);

            hoveredObject.layers.mask = originalLayers;
            camera.layers.mask = originalCameraLayers;
            
            this._updateTooltip(hoveredObject);
        } else {
            this._tooltip.hide();
        }
    },

    _updateTooltip(hoveredObject) {
        const material = hoveredObject.material;
        const capturedVars = this._capturedVarsByMaterial.get(material.uuid);
        if (!capturedVars) { this._tooltip.hide(); return; }

        const rect = this._renderer.domElement.getBoundingClientRect();
        const canvasX = this._lastTooltipX - rect.left;
        const canvasY = rect.height - (this._lastTooltipY - rect.top);

        this._renderer.readRenderTargetPixels(this._mrt, canvasX, canvasY, 1, 1, this._colorDataBuffer, 0);
        const finalAlpha = this._colorDataBuffer[3];
        
        if (finalAlpha < 0.01) { this._tooltip.hide(); return; }

        let tooltipContent = '';
        for (const { label, slot } of capturedVars) {
            const renderTargetIndex = slot + 1;
            this._renderer.readRenderTargetPixels(this._mrt, canvasX, canvasY, 1, 1, this._debugDataBuffer, renderTargetIndex);
            
            const [r, g, b, a] = this._debugDataBuffer;
            let valueStr = '';

            if (a < 0.5) {
                valueStr = '<unwritten>';
            } else if (Math.abs(r - g) < 0.001 && Math.abs(g - b) < 0.001) {
                valueStr = r.toFixed(3);
            } else {
                valueStr = `\n  R|X: ${r.toFixed(3)}\n  G|Y: ${g.toFixed(3)}\n  B|Z: ${b.toFixed(3)}`;
            }
            tooltipContent += `${label}: ${valueStr}\n`;
        }
        this._tooltip.show(this._lastTooltipX, this._lastTooltipY, tooltipContent.trim());
    },

    _updateRenderTarget(requiredTargets) {
        if (!this._mrt || this._mrt.count < requiredTargets) {
            if (this._mrt) this._mrt.dispose();
            const { width, height } = this._renderer.domElement;
            this._mrt = new WebGLRenderTarget(width, height, { count: requiredTargets, type: FloatType });
        }
    },

    _addEventListeners() {
        this._renderer.domElement.addEventListener('mousemove', this._onMouseMove.bind(this));
        this._renderer.domElement.addEventListener('mouseleave', this._onMouseLeave.bind(this));
    },
    
    _onMouseMove(event) {
        const rect = this._renderer.domElement.getBoundingClientRect();
        this._mouse.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
        this._mouse.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
        this._lastTooltipX = event.pageX;
        this._lastTooltipY = event.pageY;
    },

    _onMouseLeave() {
        this._mouse.set(9999, 9999);
        this._tooltip.hide();
    },
    
    _overrideRenderMethod() {
        this._originalRenderMethod = this._renderer.render.bind(this._renderer);
        this._renderer.render = this._render.bind(this);
    },
};

export default inspector;