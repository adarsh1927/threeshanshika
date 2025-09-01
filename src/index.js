/**
 * Threeshanshika | A live shader inspector for Three.js
 *build 4
 * @author adarsh1927
 * @license MIT
 */

import { WebGLRenderTarget, FloatType, Raycaster, Vector2, Color } from 'three';
import { instrumentShader } from './core/GLSLInstrumenter.js';
import { Tooltip } from './ui/Tooltip.js';

const inspector = {
    // --- STATE ---
    _renderer: null, _camera: null, _scene: null, _tooltip: null, _isInitialized: false,
    _mrt: null, _capturedVarsByMaterial: new Map(), _debugDataBuffer: new Float32Array(4),
    _colorDataBuffer: new Float32Array(4), // For reading the final alpha
    _originalRenderMethod: null,

    // --- RAYCASTING ---
    _raycaster: new Raycaster(), _mouse: new Vector2(),
    _activeMaterial: null, _lastTooltipX: 0, _lastTooltipY: 0,

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
        this._addEventListeners();
        this._overrideRenderMethod();
        console.log("Threeshanshika Inspector: Initialized and ready.");
    },

    patch(material) {
        if (!material) { console.warn("Threeshanshika: patch() called with a null or undefined material."); return; }
        if (material.userData.isPatchedByInspector) return;
        this._applyPatch(material);
    },

    // (_applyPatch is correct from our last step and does not need to change)
    _applyPatch(material) {
        if (material.userData.isPatchedByInspector) return;
        material.onBeforeCompile = (shader) => {
            const vsResult = instrumentShader(shader.vertexShader, 'vertex');
            const fsResult = instrumentShader(shader.fragmentShader, 'fragment');
            const allVars = [...vsResult.inspectedVars, ...fsResult.inspectedVars];
            if (allVars.length === 0) return;
            const allUsedSlots = [...new Set(allVars.map(v => v.slot))].sort((a,b)=>a-b);
            const vsUsedSlots = [...new Set(vsResult.inspectedVars.map(v => v.slot))].sort((a,b)=>a-b);
            let vsDeclarations = '';
            for (const slot of vsUsedSlots) { vsDeclarations += `${vsResult.inspectedVars.find(v => v.slot === slot).isFlat ? 'flat ' : ''}varying vec4 threeshanshika_v_debug_${slot};\n`; }
            let finalVertexShader = vsResult.modifiedCode;
            if (vsDeclarations) {
                const lines = finalVertexShader.split('\n');
                let insertionPoint = 0;
                for (let i = 0; i < lines.length; i++) { const line = lines[i].trim(); if (line.startsWith('#version') || line.startsWith('precision')) { insertionPoint = i + 1; } if (line.startsWith('void main()')) { break; } }
                lines.splice(insertionPoint, 0, vsDeclarations);
                finalVertexShader = lines.join('\n');
            }
            shader.vertexShader = finalVertexShader;
            let fsDeclarations = '';
            let fsAssignments = '';
            for (const slot of allUsedSlots) { fsDeclarations += `layout(location = ${slot + 1}) out vec4 threeshanshika_f_debug_${slot};\n`; }
            for (const slot of vsUsedSlots) {
                const vsVar = vsResult.inspectedVars.find(v => v.slot === slot);
                fsDeclarations += `${vsVar.isFlat ? 'flat ' : ''}varying vec4 threeshanshika_v_debug_${slot};\n`;
                fsAssignments += `    threeshanshika_f_debug_${slot} = threeshanshika_v_debug_${slot};\n`;
            }
            let finalFragmentShader = fsResult.modifiedCode;
            const mainFunctionIndex = finalFragmentShader.indexOf('void main()');
            if (mainFunctionIndex === -1) return;
            const lines = finalFragmentShader.split('\n');
            let insertionPoint = 0;
            for (let i = 0; i < lines.length; i++) { const line = lines[i].trim(); if (line.startsWith('#version') || line.startsWith('precision')) { insertionPoint = i + 1; } if (line.startsWith('void main()')) { break; } }
            lines.splice(insertionPoint, 0, fsDeclarations);
            finalFragmentShader = lines.join('\n');
            const mainOpeningBrace = finalFragmentShader.indexOf('{', mainFunctionIndex);
            finalFragmentShader = finalFragmentShader.slice(0, mainOpeningBrace + 1) + '\n' + fsAssignments + finalFragmentShader.slice(mainOpeningBrace + 1);
            shader.fragmentShader = finalFragmentShader;
            const sortedVars = allVars.sort((a, b) => a.slot - b.slot);
            this._capturedVarsByMaterial.set(material.uuid, sortedVars);
            const highestSlot = Math.max(...allUsedSlots);
            this._updateRenderTarget(highestSlot + 2);
        };
        material.needsUpdate = true;
        material.userData.isPatchedByInspector = true;
    },

    _addEventListeners() {
        this._renderer.domElement.addEventListener('mousemove', this._onMouseMove.bind(this));
        this._renderer.domElement.addEventListener('mouseleave', this._onMouseLeave.bind(this));
    },

    _overrideRenderMethod() {
        this._originalRenderMethod = this._renderer.render.bind(this._renderer);
        this._renderer.render = this._render.bind(this);
    },
    
    _onMouseMove(event) {
        const rect = this._renderer.domElement.getBoundingClientRect();
        this._mouse.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
        this._mouse.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
        this._lastTooltipX = event.pageX;
        this._lastTooltipY = event.pageY;
    },

    _onMouseLeave() {
        this._mouse.set(999, 999); 
        this._tooltip.hide();
    },

    // In threeshanshika/src/index.js - REPLACE THIS ENTIRE FUNCTION

    _render(scene, camera) {
        // Raycaster logic to find the hovered material
        this._raycaster.setFromCamera(this._mouse, camera);
        const intersects = this._raycaster.intersectObjects(scene.children, true);
        let hoveredMaterial = null;
        if (intersects.length > 0) {
            const firstObject = intersects[0].object;
            if (firstObject.material && this._capturedVarsByMaterial.has(firstObject.material.uuid)) {
                hoveredMaterial = firstObject.material;
            }
        }
        this._activeMaterial = hoveredMaterial;
        
        // The render passes are correct.
        const hasPatchedMaterials = this._capturedVarsByMaterial.size > 0;
        if (hasPatchedMaterials && this._mrt) {
            this._renderer.setRenderTarget(this._mrt);
            this._originalRenderMethod(scene, camera);
            
            this._renderer.setRenderTarget(null);
            this._originalRenderMethod(scene, camera);
        } else {
            this._originalRenderMethod(scene, camera);
        }

        // --- THIS IS THE FINAL, CORRECTED TOOLTIP LOGIC ---
        if (this._activeMaterial) {
            const capturedVars = this._capturedVarsByMaterial.get(this._activeMaterial.uuid);
            if (!capturedVars || capturedVars.length === 0) { this._tooltip.hide(); return; }
            
            const rect = this._renderer.domElement.getBoundingClientRect();
            const canvasX = this._lastTooltipX - rect.left;
            const canvasY = this._lastTooltipY - rect.top;

            // First, perform the Hybrid Alpha Check to see if we should show the tooltip at all.
            this._renderer.readRenderTargetPixels(this._mrt, canvasX, this._mrt.height - canvasY, 1, 1, this._colorDataBuffer, 0);
            const finalAlpha = this._colorDataBuffer[3];
            const epsilon = 0.001;

            if (finalAlpha < epsilon) {
                this._tooltip.hide();
                return;
            }

            // If we should show it, build the content string.
            const clearColor = this._renderer.getClearColor(new Color());
            let tooltipContent = '';
            
            // This is the new, simple, robust loop.
            for (const { label, slot, isFlat } of capturedVars) {
                // STEP 1: Always read the fresh data for the CURRENT variable.
                const renderTargetIndex = slot + 1;
                this._renderer.readRenderTargetPixels(this._mrt, canvasX, this._mrt.height - canvasY, 1, 1, this._debugDataBuffer, renderTargetIndex);
                const [r, g, b] = this._debugDataBuffer;

                // STEP 2: Format the value string based on the fresh data.
                let valueStr = '';
                const isDiscarded = isFlat &&
                                Math.abs(r - clearColor.r) < epsilon &&
                                Math.abs(g - clearColor.g) < epsilon &&
                                Math.abs(b - clearColor.b) < epsilon;

                if (isDiscarded) {
                    valueStr = ''; // Your "Empty on Discard" polish
                } else if (Math.abs(r - g) < epsilon && Math.abs(g - b) < epsilon) {
                    valueStr = r.toFixed(3); // Assumed float
                } else {
                    valueStr = `\n  R|X: ${r.toFixed(3)}\n  G|Y: ${g.toFixed(3)}\n  B|Z: ${b.toFixed(3)}`;
                }
                tooltipContent += `${label}: ${valueStr}\n`;
            }
            this._tooltip.show(this._lastTooltipX, this._lastTooltipY, tooltipContent.trim());
        } else {
            this._tooltip.hide();
        }
    },

    _updateRenderTarget(requiredSlots) {
        const requiredTargets = requiredSlots;
        if (!this._mrt || this._mrt.count < requiredTargets) {
            if (this._mrt) this._mrt.dispose();
            const { width, height } = this._renderer.domElement;
            console.log(`Threeshanshika: Creating MRT with ${requiredTargets} targets.`);
            this._mrt = new WebGLRenderTarget(width, height, { count: requiredTargets, type: FloatType });
        }
    }
};

export default inspector;