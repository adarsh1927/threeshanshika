/**
 * Threeshanshika | A live shader inspector for Three.js
 *
 * @author adarsh1927
 * @license MIT
 */
console.log('recompile 3')
import { WebGLRenderTarget, FloatType } from 'three';
import { instrumentShader } from './core/GLSLInstrumenter.js';
import { Tooltip } from './ui/Tooltip.js';

const inspector = {
    _renderer: null,
    _tooltip: null,
    _pendingMaterials: [],
    _isInitialized: false,
    _mrt: null,
    _capturedVarsByMaterial: new Map(), // Map<material_uuid, inspectedVars[]>
    _debugDataBuffer: new Float32Array(4),
    _activeMaterial: null, // The material currently under the cursor

    init(renderer) {
        if (!renderer || typeof renderer.domElement === 'undefined') {
            console.error("Threeshanshika: Invalid renderer provided to init()."); return;
        }
        if (this._isInitialized) {
            console.warn("Threeshanshika: Inspector already initialized."); return;
        }
        this._renderer = renderer;
        this._isInitialized = true;
        this._tooltip = new Tooltip();
        this._addEventListeners();
        this._overrideRenderMethod();
        this._processPendingPatches();
        console.log("Threeshanshika Inspector: Initialized and ready.");
    },

    patch(material) {
        if (!material) {
            console.warn("Threeshanshika: patch() called with a null or undefined material."); return;
        }
        if (!this._isInitialized) {
            if (!this._pendingMaterials.includes(material)) {
                this._pendingMaterials.push(material);
            }
        } else {
            this._applyPatch(material);
        }
    },

    _processPendingPatches() {
        this._pendingMaterials.forEach(material => this._applyPatch(material));
        this._pendingMaterials = [];
    },

    _applyPatch(material) {
        if (material.userData.isPatchedByInspector) return;
    
        material.onBeforeCompile = (shader) => {
            const vsResult = instrumentShader(shader.vertexShader, 'vertex');
            const fsResult = instrumentShader(shader.fragmentShader, 'fragment');
            
            const allVars = [...vsResult.inspectedVars, ...fsResult.inspectedVars];
            if (allVars.length === 0) return;
    
            const allUsedSlots = [...new Set(allVars.map(v => v.slot))].sort((a,b)=>a-b);
            const vsUsedSlots = [...new Set(vsResult.inspectedVars.map(v => v.slot))].sort((a,b)=>a-b);
    
            // --- Finalize Vertex Shader ---
            let vsDeclarations = '';
            for (const slot of vsUsedSlots) {
                vsDeclarations += `varying vec4 threeshanshika_v_debug_${slot};\n`;
            }
            
            let finalVertexShader = vsResult.modifiedCode;
            if (vsDeclarations) {
                // Inject the 'varying' declarations into the vertex shader
                const lines = finalVertexShader.split('\n');
                let insertionPoint = 0;
                for (let i = 0; i < lines.length; i++) {
                    const line = lines[i].trim();
                    if (line.startsWith('#version') || line.startsWith('precision')) {
                        insertionPoint = i + 1;
                    }
                    if (line.startsWith('void main()')) { break; }
                }
                lines.splice(insertionPoint, 0, vsDeclarations);
                finalVertexShader = lines.join('\n');
            }
            shader.vertexShader = finalVertexShader;
    
            // --- Finalize Fragment Shader ---
            let fsDeclarations = '';
            let fsAssignments = '';
    
            // Add 'out' declarations for ALL used slots (from both VS and FS).
            for (const slot of allUsedSlots) {
                fsDeclarations += `layout(location = ${slot + 1}) out vec4 threeshanshika_f_debug_${slot};\n`;
            }
            // Add 'varying' declarations for slots coming FROM the VS.
            for (const slot of vsUsedSlots) {
                fsDeclarations += `varying vec4 threeshanshika_v_debug_${slot};\n`;
                fsAssignments += `    threeshanshika_f_debug_${slot} = threeshanshika_v_debug_${slot};\n`;
            }
    
            let finalFragmentShader = fsResult.modifiedCode;
            const mainFunctionIndex = finalFragmentShader.indexOf('void main()');
            if (mainFunctionIndex === -1) return;
    
            // Inject all declarations before main().
            const lines = finalFragmentShader.split('\n');
            let insertionPoint = 0;
            for (let i = 0; i < lines.length; i++) {
                const line = lines[i].trim();
                if (line.startsWith('#version') || line.startsWith('precision')) {
                    insertionPoint = i + 1;
                }
                if (line.startsWith('void main()')) { break; }
            }
            lines.splice(insertionPoint, 0, fsDeclarations);
            finalFragmentShader = lines.join('\n');
            
            // Inject all assignments at the start of main().
            const mainOpeningBrace = finalFragmentShader.indexOf('{', mainFunctionIndex);
            finalFragmentShader =
                finalFragmentShader.slice(0, mainOpeningBrace + 1) + '\n' +
                fsAssignments +
                finalFragmentShader.slice(mainOpeningBrace + 1);
    
            shader.fragmentShader = finalFragmentShader;
    
            // --- Finalize Setup ---
            const sortedVars = allVars.sort((a, b) => a.slot - b.slot);
            this._capturedVarsByMaterial.set(material.uuid, sortedVars);
            const highestSlot = Math.max(...allUsedSlots);
            this._updateRenderTarget(highestSlot + 2); // +1 for our slots, +1 for gl_FragColor
        };
    
        material.needsUpdate = true;
        material.userData.isPatchedByInspector = true;
    },

    _addEventListeners() {
        const domElement = this._renderer.domElement;
        domElement.addEventListener('mousemove', this._onMouseMove.bind(this));
        domElement.addEventListener('mouseleave', this._onMouseLeave.bind(this));
    },

    _overrideRenderMethod() {
        this._originalRenderMethod = this._renderer.render.bind(this._renderer);
        this._renderer.render = this._render.bind(this);
    },

    _onMouseMove(event) {
        if (!this._mrt || !this._activeMaterial) {
            this._tooltip.hide();
            return;
        }

        const capturedVars = this._capturedVarsByMaterial.get(this._activeMaterial.uuid);
        if (!capturedVars || capturedVars.length === 0) {
            this._tooltip.hide();
            return;
        }

        const rect = this._renderer.domElement.getBoundingClientRect();
        const mouseX = event.clientX - rect.left;
        const mouseY = event.clientY - rect.top;

        let tooltipContent = '';
        for (const { label, slot } of capturedVars) {
            const renderTargetIndex = slot + 1; // Index 0 is the main color buffer
            this._renderer.readRenderTargetPixels(
                this._mrt,
                mouseX,
                this._mrt.height - mouseY, // In WebGL, Y is flipped.
                1, 1,
                this.debugDataBuffer,
                renderTargetIndex 
            );
            
            const [r, g, b] = this.debugDataBuffer;
            const valueStr = `R:${r.toFixed(3)} G:${g.toFixed(3)} B:${b.toFixed(3)}`;
            tooltipContent += `${label}: ${valueStr}\n`;
        }

        this._tooltip.show(event.pageX, event.pageY, tooltipContent.trim());
    },

    _onMouseLeave() {
        this._tooltip.hide();
    },
    
    _render(scene, camera) {
        // Find which material (if any) is under the cursor.
        // This is a simplified approach. A real implementation would use raycasting.
        // For now, we assume if we have an MRT, something is active.
        const materialsWithVars = Array.from(this._capturedVarsByMaterial.keys());
        if (materialsWithVars.length > 0 && this._mrt) {
             // Find a material in the scene that has been patched
            let foundMaterialUUID = null;
            scene.traverse(obj => {
                if (obj.isMesh && obj.material && materialsWithVars.includes(obj.material.uuid)) {
                    foundMaterialUUID = obj.material.uuid;
                    this._activeMaterial = obj.material;
                }
            });

            if(foundMaterialUUID) {
                this._renderer.setRenderTarget(this._mrt);
                this._originalRenderMethod(scene, camera);
                this._renderer.setRenderTarget(null);
                this._renderer.blitRenderTarget(this._mrt, null, true, 0); // Display color buffer
                return;
            }
        }
        
        // If no materials to inspect are in the scene, render normally.
        this._activeMaterial = null;
        this._originalRenderMethod(scene, camera);
    },

    _updateRenderTarget(requiredSlots) {
        const requiredTargets = requiredSlots + 1;
        // If our MRT is non-existent or too small, create a new one.
        if (!this._mrt || this._mrt.count < requiredTargets) {
            if (this._mrt) this._mrt.dispose();
            
            const { width, height } = this._renderer.domElement;
            console.log(`Threeshanshika: Creating MRT with ${requiredTargets} targets.`);
            this._mrt = new WebGLRenderTarget(width, height, {
                count: requiredTargets,
                type: FloatType
            });
        }
    }
};

export default inspector;