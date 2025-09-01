/**
 * Threeshanshika | A live shader inspector for Three.js
 *
 * @author adarsh1927
 * @license MIT
 */

import { WebGLRenderTarget, FloatType, Raycaster, Vector2, OrthographicCamera, PlaneGeometry, ShaderMaterial, Mesh, Scene } from 'three';
import { instrumentShader } from './core/GLSLInstrumenter.js';
import { Tooltip } from './ui/Tooltip.js';

// --- THIS IS THE NEW, CORRECTED HELPER CLASS Adarsh---
class CopyPass {
    constructor() {
        this.scene = new Scene();
        this.camera = new OrthographicCamera(-1, 1, 1, -1, 0, 1);
        this.geometry = new PlaneGeometry(2, 2);
        this.material = new ShaderMaterial({
            vertexShader: `
                varying vec2 vUv;
                void main() { vUv = uv; gl_Position = vec4(position, 1.0); }
            `,
            fragmentShader: `
                uniform sampler2D tDiffuse;
                varying vec2 vUv;
                void main() { gl_FragColor = texture2D(tDiffuse, vUv); }
            `,
            uniforms: { tDiffuse: { value: null } },
            transparent: true,
        });
        this.mesh = new Mesh(this.geometry, this.material);
        this.scene.add(this.mesh);
    }
    
    // --- THIS IS THE CRITICAL FIX ---
    // It now accepts the ORIGINAL render method to avoid infinite recursion.
    render(originalRenderMethod, texture) {
        this.material.uniforms.tDiffuse.value = texture;
        // It calls the original, un-hijacked render method.
        originalRenderMethod(this.scene, this.camera);
    }
}


const inspector = {
    // ... (state properties remain the same)
    _renderer: null, _camera: null, _scene: null, _tooltip: null, _isInitialized: false,
    _mrt: null, _capturedVarsByMaterial: new Map(), _debugDataBuffer: new Float32Array(4),
    _copyPass: null, _raycaster: new Raycaster(), _mouse: new Vector2(),
    _activeMaterial: null, _lastTooltipX: 0, _lastTooltipY: 0,
    _originalRenderMethod: null, // We need to store this

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
        this._copyPass = new CopyPass();
        this._addEventListeners();
        this._overrideRenderMethod();
        console.log("Threeshanshika Inspector: Initialized and ready.");
    },

    patch(material) {
        // ... (patch function remains the same)
        if (!material) { console.warn("Threeshanshika: patch() called with a null or undefined material."); return; }
        if (material.userData.isPatchedByInspector) return;
        this._applyPatch(material);
    },

    _applyPatch(material) {
        // ... (_applyPatch function is correct and remains the same)
        if (material.userData.isPatchedByInspector) return;
        material.onBeforeCompile = (shader) => {
            const vsResult = instrumentShader(shader.vertexShader, 'vertex');
            const fsResult = instrumentShader(shader.fragmentShader, 'fragment');
            const allVars = [...vsResult.inspectedVars, ...fsResult.inspectedVars];
            if (allVars.length === 0) return;
            const allUsedSlots = [...new Set(allVars.map(v => v.slot))].sort((a,b)=>a-b);
            const vsUsedSlots = [...new Set(vsResult.inspectedVars.map(v => v.slot))].sort((a,b)=>a-b);
            let vsDeclarations = '';
            for (const slot of vsUsedSlots) { vsDeclarations += `varying vec4 threeshanshika_v_debug_${slot};\n`; }
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
            for (const slot of vsUsedSlots) { fsDeclarations += `varying vec4 threeshanshika_v_debug_${slot};\n`; fsAssignments += `    threeshanshika_f_debug_${slot} = threeshanshika_v_debug_${slot};\n`; }
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
        // ... (mouse move remains the same)
        const rect = this._renderer.domElement.getBoundingClientRect();
        this._mouse.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
        this._mouse.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
        this._lastTooltipX = event.pageX;
        this._lastTooltipY = event.pageY;
    },

    _onMouseLeave() {
        // ... (mouse leave remains the same)
        this._mouse.set(999, 999); 
        this._tooltip.hide();
    },

    _render(scene, camera) {
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
        
        const hasPatchedMaterials = this._capturedVarsByMaterial.size > 0;
        if (hasPatchedMaterials && this._mrt) {
            this._renderer.setRenderTarget(this._mrt);
            this._originalRenderMethod(scene, camera);
            
            this._renderer.setRenderTarget(null);
            
            const autoClear = this._renderer.autoClear;
            this._renderer.autoClear = false;
            // --- THIS IS THE SECOND CRITICAL FIX ---
            // We pass the ORIGINAL render method to the CopyPass.
            this._copyPass.render(this._originalRenderMethod, this._mrt.texture[0]);
            this._renderer.autoClear = autoClear;

        } else {
            this._originalRenderMethod(scene, camera);
        }

        if (this._activeMaterial) {
            // ... (tooltip logic remains the same)
            const capturedVars = this._capturedVarsByMaterial.get(this._activeMaterial.uuid);
            if (!capturedVars || capturedVars.length === 0) { this._tooltip.hide(); return; }
            const rect = this._renderer.domElement.getBoundingClientRect();
            const canvasX = this._lastTooltipX - rect.left;
            const canvasY = this._lastTooltipY - rect.top;
            let tooltipContent = '';
            for (const { label, slot } of capturedVars) {
                const renderTargetIndex = slot + 1;
                this._renderer.readRenderTargetPixels(this._mrt, canvasX, this._mrt.height - canvasY, 1, 1, this._debugDataBuffer, renderTargetIndex);
                const [r, g, b] = this._debugDataBuffer;
                const epsilon = 0.001;
                let valueStr = '';
                if (Math.abs(r - g) < epsilon && Math.abs(g - b) < epsilon) {
                    valueStr = r.toFixed(3);
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
        // ... (update render target remains the same)
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