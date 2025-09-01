// In threeshanshika/src/core/GLSLInstrumenter.js

const VARYING_PREFIX = 'threeshanshika_v_debug_';
const OUTPUT_PREFIX = 'threeshanshika_f_debug_';

export function instrumentShader(shaderCode, shaderStage) {
    const inspectRegex = /inspect\("([^"]*)",\s*(.*?),\s*(\d+)\);/g;
    const inspectedVars = [];
    const replacements = new Map();
    
    let match;
    while ((match = inspectRegex.exec(shaderCode)) !== null) {
        const [fullMatch, label, expression, slotStr] = match;
        const slot = parseInt(slotStr, 10);
        inspectedVars.push({ label, expression, slot, stage: shaderStage });

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