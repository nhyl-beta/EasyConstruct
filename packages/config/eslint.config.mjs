export function sharedTypescriptConfigs(js, tseslint) {
  return [js.configs.recommended, ...tseslint.configs.recommended];
}
