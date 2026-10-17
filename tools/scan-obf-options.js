

























export function obfOptions(strong) {
  return {
    advertisement: false,   
    compact: true, simplify: true, renameGlobals: false,
    identifierNamesGenerator: strong ? 'hexadecimal' : 'mangled-shuffled',
    stringArray: true,
    stringArrayEncoding: strong ? ['rc4'] : ['base64'],
    stringArrayThreshold: strong ? 1 : 0.85,
    stringArrayRotate: true, stringArrayShuffle: true,
    splitStrings: true, splitStringsChunkLength: strong ? 8 : 10,
    stringArrayWrappersCount: strong ? 3 : 2, stringArrayWrappersType: 'function',
    stringArrayWrappersChainedCalls: true, stringArrayWrappersParametersMaxCount: 4,
    controlFlowFlattening: strong, controlFlowFlatteningThreshold: 0.6,
    deadCodeInjection: strong, deadCodeInjectionThreshold: 0.2,
    numbersToExpressions: true, transformObjectKeys: false,
    selfDefending: true, disableConsoleOutput: false, debugProtection: false,
    seed: 0, target: 'browser-no-eval', sourceMap: false   
  };
}
