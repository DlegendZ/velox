/** Geometry/physics tests need canvas pixels, not a browser renderer. */
export function installCanvasMock() {
  const descriptor = Object.getOwnPropertyDescriptor(globalThis, "document");
  const noop = () => {};
  const gradient = () => ({ addColorStop: noop });
  const context = new Proxy(
    {
      createImageData: (width: number, height: number) => ({
        width,
        height,
        data: new Uint8ClampedArray(width * height * 4),
      }),
      createLinearGradient: gradient,
      createRadialGradient: gradient,
      measureText: (text: string) => ({ width: text.length * 8 }),
    } as Record<string, unknown>,
    {
      get: (target, key: string) => target[key] ?? noop,
      set: (target, key: string, value: unknown) => {
        target[key] = value;
        return true;
      },
    },
  );
  Object.defineProperty(globalThis, "document", {
    configurable: true,
    value: {
      createElement: () => ({
        width: 0,
        height: 0,
        getContext: () => context,
      }),
      addEventListener: noop,
    },
  });
  return () => {
    if (descriptor) Object.defineProperty(globalThis, "document", descriptor);
    else Reflect.deleteProperty(globalThis, "document");
  };
}
