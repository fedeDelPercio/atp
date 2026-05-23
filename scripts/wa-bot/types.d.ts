declare module "qrcode-terminal" {
  function generate(text: string, options?: { small?: boolean }): void;
  function generate(text: string, callback: (qrcode: string) => void): void;
  function generate(
    text: string,
    options: { small?: boolean },
    callback: (qrcode: string) => void,
  ): void;
  const _default: { generate: typeof generate };
  export default _default;
  export { generate };
}
