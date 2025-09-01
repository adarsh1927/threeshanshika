// In threeshanshika/src/core/GLSLInstrumenter.js

const VARYING_PREFIX = 'threeshanshika_v_debug_';
const OUTPUT_PREFIX = 'threeshanshika_f_debug_';

export function instrumentShader(shaderCode, shaderStage) {
    // This is the final, robust regex. It looks for the optional 'flat' keyword.
    const inspectRegex = /inspect\(\s*"([^"]*)"\s*,\s*(.*?)\s*,\s*(\d+)\s*(,\s*flat)?\s*\);/g;

    const inspectedVars = [];
    const replacements = new Map();
    
    let match;
    while ((match = inspectRegex.exec(shaderCode)) !== null) {
        const [fullMatch, label, expression, slotStr, optionalFlat] = match;
        const slot = parseInt(slotStr, 10);
        
        // The check for 'flat' is now clean and simple.
        const isFlat = !!optionalFlat; // Will be true if ", flat" was found.
        
        inspectedVars.push({ label, expression, slot, stage: shaderStage, isFlat });

        const packedValue = `vec4(vec3(${expression}), 1.0)`;
        if (shaderStage === 'vertex') {
            replacements.set(fullMatch, `${VARYING_PREFIX}${slot} = ${packedValue};`);
        } else {
            replacements.set(fullMatch, `${OUTPUT_PREFIX}${slot} = ${packedValue};`);
        }
    }

    if (inspectedVars.length === 0) {
        return { modifiedCode: shaderCode, inspectedVars: [], vertexVaryingDeclarations: '', fragmentVaryingAssignments: '' };
    }

    let modifiedCode = shaderCode;
    for (const [original, replacement] of replacements.entries()) {
        modifiedCode = modifiedCode.replace(original, replacement);
    }
    
    let vertexVaryingDeclarations = '';
    let fragmentVaryingAssignments = '';

    if (shaderStage === 'vertex') {
        const uniqueVars = [];
        for (const v of inspectedVars) {
            if (!uniqueVars.some(uv => uv.slot === v.slot)) {
                const finalIsFlat = inspectedVars.some(iv => iv.slot === v.slot && iv.isFlat);
                uniqueVars.push({ slot: v.slot, isFlat: finalIsFlat });
            }
        }
        
        for (const { slot, isFlat } of uniqueVars) {
            const varyingName = `${VARYING_PREFIX}${slot}`;
            const flatQualifier = isFlat ? 'flat ' : '';
            
            vertexVaryingDeclarations += `${flatQualifier}varying vec4 ${varyingName};\n`;
            
            const outputName = `${OUTPUT_PREFIX}${slot}`;
            fragmentVaryingAssignments += `    ${outputName} = ${varyingName};\n`;
        }
    }
    
    return {
        modifiedCode,
        inspectedVars,
        vertexVaryingDeclarations,
        fragmentVaryingAssignments
    };
}