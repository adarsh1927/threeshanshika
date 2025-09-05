// In threeshanshika/src/core/GLSLInstrumenter.js
// --- FINAL VERSION ---
// This file is responsible for parsing GLSL code to find `inspect()` calls.
// It replaces them with the necessary code to output debug data to a render target.

const VARYING_PREFIX = 'threeshanshika_v_debug_';
const OUTPUT_PREFIX = 'threeshanshika_f_debug_';

/**
 * Instruments a shader to capture the values of inspected variables.
 * @param {string} shaderCode The source code of the shader.
 * @param {string} shaderStage Either 'vertex' or 'fragment'.
 * @returns {object} An object containing the modified code and metadata about inspected variables.
 */
export function instrumentShader(shaderCode, shaderStage) {
    // Regex to find: inspect("label", variable, slot, optional_flat_keyword);
    const inspectRegex = /inspect\(\s*"([^"]*)"\s*,\s*(.*?)\s*,\s*(\d+)\s*(,\s*flat)?\s*\);/g;

    const inspectedVars = [];
    const replacements = new Map();
    
    let match;
    // Find all occurrences of the inspect() function in the shader.
    while ((match = inspectRegex.exec(shaderCode)) !== null) {
        const [fullMatch, label, expression, slotStr, optionalFlat] = match;
        const slot = parseInt(slotStr, 10);
        
        // Convert the optional ", flat" argument into a boolean.
        const isFlat = !!optionalFlat;
        
        inspectedVars.push({ label, expression, slot, stage: shaderStage, isFlat });

        // The value to be written to the debug buffer.
        // We cast the expression to a vec3 and store it in the RGB channels.
        // The alpha channel (W) is set to 1.0 to indicate a valid, non-discarded value.
        const packedValue = `vec4(vec3(${expression}), 1.0)`;

        if (shaderStage === 'vertex') {
            // In the vertex shader, assign the value to a varying to pass it to the fragment shader.
            replacements.set(fullMatch, `${VARYING_PREFIX}${slot} = ${packedValue};`);
        } else {
            // In the fragment shader, assign the value directly to the corresponding 'out' variable.
            replacements.set(fullMatch, `${OUTPUT_PREFIX}${slot} = ${packedValue};`);
        }
    }

    // If no inspect() calls were found, return the original code without modification.
    if (inspectedVars.length === 0) {
        return { modifiedCode: shaderCode, inspectedVars: [], fragmentVaryingAssignments: '' };
    }

    // Replace all inspect() calls with their new GLSL assignments.
    let modifiedCode = shaderCode;
    for (const [original, replacement] of replacements.entries()) {
        modifiedCode = modifiedCode.replace(original, replacement);
    }
    
    let fragmentVaryingAssignments = '';

    // This section is only relevant for variables inspected in the VERTEX shader.
    // It creates the code that will be injected into the FRAGMENT shader to receive the data.
    if (shaderStage === 'vertex') {
        const uniqueSlots = [...new Set(inspectedVars.map(v => v.slot))];
        
        for (const slot of uniqueSlots) {
            // This GLSL line reads the value from the varying and writes it to the final output buffer.
            // This must happen inside the fragment shader's main() function.
            fragmentVaryingAssignments += `    ${OUTPUT_PREFIX}${slot} = ${VARYING_PREFIX}${slot};\n`;
        }
    }
    
    return {
        modifiedCode,
        inspectedVars,
        fragmentVaryingAssignments
    };
}