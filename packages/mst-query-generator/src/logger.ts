export type ConfigurationLoggerType = (input: string, outDir: string) => void;
export type SchemaTypesLoggerType = (json: string) => void;

export const printConfigurationParams = (
    inputFilePath: string,
    outputDirectory: string,
    fileExtension = 'ts'
) => {
    const formatPart = `--format=\{${fileExtension}\}`;
    const outDirPart = `--outDir=\{${outputDirectory}\}`;
    const inputFilePart = `${inputFilePath}`;
    console.log(`generator ${formatPart} ${outDirPart} ${inputFilePart}`);
};

export const printDetectedSchemaTypes = (json: any) => {
    const detectedTypesOutput = `Detected types:\n`;
    const getTypeOutputFn = (type: any) => `  - [${type.kind}] ${type.name}`;
    const types = json.__schema.types.map(getTypeOutputFn).join('\n');
    console.log(detectedTypesOutput, types);
};
