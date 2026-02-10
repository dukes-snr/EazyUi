
import { designSpecJsonSchema } from './packages/shared/src/schemas/index.ts';

function stripAdditionalProperties(schema: any): any {
    if (typeof schema !== 'object' || schema === null) return schema;

    if (Array.isArray(schema)) {
        return schema.map(stripAdditionalProperties);
    }

    const newSchema = { ...schema };
    if ('additionalProperties' in newSchema) {
        delete newSchema.additionalProperties;
    }

    for (const key in newSchema) {
        newSchema[key] = stripAdditionalProperties(newSchema[key]);
    }

    return newSchema;
}

console.log('--- Original Schema Fragment (Tokens) ---');
// Logs the 'tokens' part which caused error at properties[3]
console.log(JSON.stringify(designSpecJsonSchema.properties.tokens, null, 2));

console.log('--- Fixed Schema Fragment (Tokens) ---');
const fixedSchema = stripAdditionalProperties(designSpecJsonSchema);
console.log(JSON.stringify(fixedSchema.properties.tokens, null, 2));
