// In src/core/GLSLInstrumenter.test.js

import { describe, it, expect } from 'vitest';
import { instrumentShader } from './GLSLInstrumenter.js';

describe('GLSLInstrumenter', () => {

    it('should not modify a shader with no inspect() calls', () => {
        const shaderCode = `
            void main() {
                gl_FragColor = vec4(1.0);
            }
        `;
        const result = instrumentShader(shaderCode, 'fragment');
        expect(result.modifiedCode).toBe(shaderCode);
        expect(result.inspectedVars.length).toBe(0);
    });

    it('should instrument a simple fragment shader variable', () => {
        const shaderCode = `
            void main() {
                float myVar = 0.5;
                inspect("My Variable", myVar, 0);
                gl_FragColor = vec4(1.0);
            }
        `;
        const result = instrumentShader(shaderCode, 'fragment');
        expect(result.modifiedCode).toContain('threeshanshika_f_debug_0 = vec4(vec3(myVar), 1.0);');
        expect(result.inspectedVars.length).toBe(1);
        expect(result.inspectedVars[0]).toEqual({
            label: 'My Variable',
            expression: 'myVar',
            slot: 0,
            stage: 'fragment',
            isFlat: false
        });
    });

    it('should instrument a simple vertex shader variable with the flat keyword', () => {
        const shaderCode = `
            void main() {
                inspect("Vertex Position", position, 1, flat);
                gl_Position = vec4(position, 1.0);
            }
        `;
        const result = instrumentShader(shaderCode, 'vertex');
        expect(result.modifiedCode).toContain('threeshanshika_v_debug_1 = vec4(vec3(position), 1.0);');
        expect(result.inspectedVars[0].isFlat).toBe(true);
    });

    it('should handle multiple inspect calls correctly', () => {
        const shaderCode = `
            varying vec2 vUv;
            void main() {
                inspect("UVs", vUv, 2);
                inspect("A Constant", 1.23, 3);
            }
        `;
        const result = instrumentShader(shaderCode, 'fragment');
        expect(result.modifiedCode).toContain('threeshanshika_f_debug_2 = vec4(vec3(vUv), 1.0);');
        expect(result.modifiedCode).toContain('threeshanshika_f_debug_3 = vec4(vec3(1.23), 1.0);');
        expect(result.inspectedVars.length).toBe(2);
    });
});