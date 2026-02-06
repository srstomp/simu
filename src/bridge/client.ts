export class BridgeClient {
  constructor(private port: number) {}

  private async request(method: string, path: string, body?: object): Promise<any> {
    const resp = await fetch(`http://localhost:${this.port}${path}`, {
      method,
      headers: body ? { "Content-Type": "application/json" } : undefined,
      body: body ? JSON.stringify(body) : undefined,
    });
    return resp.json();
  }

  async health() { return this.request("GET", "/health"); }
  async attach(bundleIdentifier: string) { return this.request("POST", "/attach", { bundleIdentifier }); }
  async getTree() { return this.request("GET", "/ui/tree"); }
  async find(query: { identifier?: string; label?: string; elementType?: string }) { return this.request("POST", "/ui/find", query); }
  async tap(params: { identifier?: string; label?: string; x?: number; y?: number }) { return this.request("POST", "/ui/tap", params); }
  async longPress(params: { identifier?: string; label?: string; duration?: number }) { return this.request("POST", "/ui/longPress", params); }
  async swipe(params: { identifier?: string; label?: string; direction: string }) { return this.request("POST", "/ui/swipe", params); }
  async type(params: { identifier?: string; label?: string; text: string }) { return this.request("POST", "/ui/type", params); }
  async clear(params: { identifier?: string; label?: string }) { return this.request("POST", "/ui/clear", params); }
  async scroll(params: { identifier?: string; direction: string }) { return this.request("POST", "/ui/scroll", params); }
  async waitFor(params: { identifier: string; timeout?: number; exists?: boolean }) { return this.request("POST", "/ui/wait", params); }
  async exists(params: { identifier?: string; label?: string }) { return this.request("POST", "/ui/exists", params); }
  async elementInfo(params: { identifier?: string; label?: string }) { return this.request("POST", "/ui/info", params); }
  async drag(params: { fromX: number; fromY: number; toX: number; toY: number }) { return this.request("POST", "/ui/drag", params); }
  async pinch(params: { identifier?: string; scale?: number; velocity?: number }) { return this.request("POST", "/ui/pinch", params); }
}
