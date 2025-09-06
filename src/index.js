/**
 * Threeshanshika | A live shader inspector for Three.js
 *build 4
 * @author adarsh1927
 * @license MIT
 */

 // In src/index.js

import { WebGLRenderTarget, FloatType, Raycaster, Vector2, Layers } from 'three';
import { instrumentShader, VARYING_PREFIX, OUTPUT_PREFIX } from './core/GLSLInstrumenter.js';
import { Tooltip } from './ui/Tooltip.js';
import { logger } from './core/Logger.js';

const inspector = {
    _renderer: null, _camera: null, _scene: null, _tooltip: null, _isInitialized: false,
    _mrt: null,
    _debugDataBuffer: new Float32Array(4),
    _colorDataBuffer: new Float32Array(4),
    _originalRenderMethod: null,
    _raycaster: new Raycaster(), _mouse: new Vector2(),
    _lastTooltipX: 0, _lastTooltipY: 0,
    _debugLayer: new Layers(),

    init(renderer, scene, camera) {
        if (this._isInitialized) { logger.warn("Inspector already initialized."); return; }
        if (!renderer || !scene || !camera) { logger.error("init() requires a renderer, scene, and camera."); return; }
        
        logger.log("Threeshanshika Inspector: Initialized and ready.");
        this._renderer = renderer;
        this._scene = scene;
        this._camera = camera;
        this._tooltip = new Tooltip();
        this._debugLayer.set(31);
        
        this._addEventListeners();
        this._overrideRenderMethod();
        this._isInitialized = true;
    },

    patch(material) {
        if (!material) { logger.warn("patch() called with a null or undefined material."); return; }
        if (material.userData.isPatchedByInspector) { logger.warn("Material already patched.", material); return; }
        
        logger.log(`Patching material: ${material.uuid} (${material.name || 'Unnamed Material'})`);
        this._applyPatch(material);
    },

    setRaycastThreshold(threshold) {
        if (typeof threshold !== 'number') { logger.error("setRaycastThreshold() expects a number."); return; }
        logger.log(`Setting raycaster points threshold to: ${threshold}`);
        this._raycaster.params.Points.threshold = threshold;
    },

    _applyPatch(material) {
        const originals = {
            vertexShader: material.vertexShader,
            fragmentShader: material.fragmentShader,
        };
        material.userData.threeshanshika_originals = originals;

        const vsResult = instrumentShader(originals.vertexShader, 'vertex');
        const fsResult = instrumentShader(originals.fragmentShader, 'fragment');
        const allVars = [...vsResult.inspectedVars, ...fsResult.inspectedVars];

        if (allVars.length === 0) {
            logger.warn('No inspect() calls found. Patching aborted.');
            return;
        }

        material.userData.threeshanshika_captured_vars = allVars.sort((a, b) => a.slot - b.slot);
        logger.log(`Captured ${allVars.length} variables for material ${material.uuid}`, allVars);
        
        material.onBeforeCompile = (shader) => {
            logger.debug(`onBeforeCompile triggered for material: ${material.uuid}`);
            
            const vsResult = instrumentShader(originals.vertexShader, 'vertex');
            const fsResult = instrumentShader(originals.fragmentShader, 'fragment');
            const capturedVars = material.userData.threeshanshika_captured_vars;

            const allUsedSlots = [...new Set(capturedVars.map(v => v.slot))].sort((a, b) => a - b);
            const vsVars = capturedVars.filter(v => v.stage === 'vertex');

            let vertexDeclarations = '', fragmentDeclarations = '';
            let fragmentAssignments = '';

            for (const v of vsVars) {
                const varyingDecl = `${v.isFlat ? 'flat ' : ''}varying vec4 ${VARYING_PREFIX}${v.slot};\n`;
                vertexDeclarations += varyingDecl;
                fragmentDeclarations += varyingDecl;
                fragmentAssignments += `    ${OUTPUT_PREFIX}${v.slot} = ${VARYING_PREFIX}${v.slot};\n`;
            }

            for (const slot of allUsedSlots) {
                fragmentDeclarations += `layout(location = ${slot + 1}) out vec4 ${OUTPUT_PREFIX}${slot};\n`;
            }
            
            shader.vertexShader = vsResult.modifiedCode.replace('void main()', vertexDeclarations + 'void main()');
            shader.fragmentShader = fsResult.modifiedCode.replace('void main()', fragmentDeclarations + 'void main()').replace(/void\s+main\s*\(\s*\)\s*\{/, 'void main() {\n' + fragmentAssignments);
            
            logger.debug("Final shader code to be injected:", { vertexShader: shader.vertexShader, fragmentShader: shader.fragmentShader });

            const highestSlot = Math.max(...allUsedSlots);
            this._updateRenderTarget(highestSlot + 2);
        };

        material.needsUpdate = true;
        material.userData.isPatchedByInspector = true;
    },

    _render(scene, camera) {
        this._renderer.setRenderTarget(null);
        this._originalRenderMethod(scene, camera);
    
        this._raycaster.setFromCamera(this._mouse, camera);
        const intersects = this._raycaster.intersectObjects(scene.children, true);
        
        let hoveredObject = null;
        // THIS CHECK IS NOW CORRECT AND ROBUST
        if (intersects.length > 0 && intersects[0].object.material && intersects[0].object.material.userData.threeshanshika_captured_vars) {
            hoveredObject = intersects[0].object;
        }
    
        if (hoveredObject) {
            logger.debug(`Hover detected on object: ${hoveredObject.uuid}. Running debug pass.`);
            
            const originalAutoClear = this._renderer.autoClear;
            const originalBackground = scene.background;
            this._renderer.autoClear = false;
            scene.background = null;
    
            const originalLayers = hoveredObject.layers.mask;
            const originalCameraLayers = camera.layers.mask;
            hoveredObject.layers.set(31);
            camera.layers.set(31);
    
            this._renderer.setRenderTarget(this._mrt);
            this._renderer.clear();
            this._originalRenderMethod(scene, camera);
    
            hoveredObject.layers.mask = originalLayers;
            camera.layers.mask = originalCameraLayers;
            scene.background = originalBackground;
            this._renderer.autoClear = originalAutoClear;
            
            this._updateTooltip(hoveredObject);
        } else {
            this._tooltip.hide();
        }
    },

    _updateTooltip(hoveredObject) {
        const material = hoveredObject.material;
        // THIS IS NOW CORRECT AND ROBUST
        const capturedVars = material.userData.threeshanshika_captured_vars;

        if (!capturedVars || capturedVars.length === 0) { this._tooltip.hide(); return; }

        const rect = this._renderer.domElement.getBoundingClientRect();
        const canvasX = this._lastTooltipX - rect.left;
        const canvasY = rect.height - (this._lastTooltipY - rect.top);
        
        logger.debug("Updating tooltip. Reading pixel data from canvas coordinates:", { canvasX, canvasY });

        this._renderer.readRenderTargetPixels(this._mrt, canvasX, canvasY, 1, 1, this._colorDataBuffer, 0);
        const finalAlpha = this._colorDataBuffer[3];
        
        if (finalAlpha < 0.01) { this._tooltip.hide(); return; }

        let tooltipContent = '';
        for (const { label, slot } of capturedVars) {
            const renderTargetIndex = slot + 1;
            this._renderer.readRenderTargetPixels(this._mrt, canvasX, canvasY, 1, 1, this._debugDataBuffer, renderTargetIndex);
            
            const [r, g, b, a] = this._debugDataBuffer;
            logger.debug(`Slot ${slot} ('${label}') RAW data:`, { r, g, b, a });
            
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
            logger.log(`Creating/resizing MRT to handle ${requiredTargets} targets.`);
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