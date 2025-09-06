// In src/core/GLSLInstrumenter.js
// --- FINAL VERSION ---
// This file is responsible for parsing GLSL code to find `inspect()` calls.
// It replaces them with the necessary code to output debug data to a render target.

export const VARYING_PREFIX = 'threeshanshika_v_debug_';
export const OUTPUT_PREFIX = 'threeshanshika_f_debug_';

/**
 * Instruments a shader to capture the values of inspected variables.
 * @param {string} shaderCode The source code of the shader.
 * @param {string} shaderStage Either 'vertex' or 'fragment'.
 * @returns {object} An object containing the modified code and metadata about inspected variables.
 */
export function instrumentShader(shaderCode, shaderStage) {
    const inspectRegex = /inspect\(\s*"([^"]*)"\s*,\s*(.*?)\s*,\s*(\d+)\s*(,\s*flat)?\s*\);/g;

    const inspectedVars = [];
    const replacements = new Map();
    
    let match;
    while ((match = inspectRegex.exec(shaderCode)) !== null) {
        const [fullMatch, label, expression, slotStr, optionalFlat] = match;
        const slot = parseInt(slotStr, 10);
        const isFlat = !!optionalFlat;
        
        inspectedVars.push({ label, expression, slot, stage: shaderStage, isFlat });

        const packedValue = `vec4(vec3(${expression}), 1.0)`;

        if (shaderStage === 'vertex') {
            replacements.set(fullMatch, `${VARYING_PREFIX}${slot} = ${packedValue};`);
        } else {
            replacements.set(fullMatch, `${OUTPUT_PREFIX}${slot} = ${packedValue};`);
        }
    }

    if (inspectedVars.length === 0) {
        return { modifiedCode: shaderCode, inspectedVars: [] };
    }

    let modifiedCode = shaderCode;
    for (const [original, replacement] of replacements.entries()) {
        modifiedCode = modifiedCode.replace(original, replacement);
    }
    
    return { modifiedCode, inspectedVars };
}