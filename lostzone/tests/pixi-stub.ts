// ============ Pixi v8 最小桩（Node 冒烟测试用） ============
export class Node2D {
  x = 0; y = 0; rotation = 0;
  scale: any = { x: 1, y: 1, set(sx: number, sy?: number) { this.x = sx; this.y = sy ?? sx; return this; } };
  position: any = { x: 0, y: 0, set(x: number, y: number) { this.x = x; this.y = y; return this; },
    copyFrom(o: any) { this.x = o.x ?? o.position?.x ?? 0; this.y = o.y ?? o.position?.y ?? 0; return this; } };
  copyFrom(o: any) { this.position.x = o.x ?? o.position?.x ?? 0; this.position.y = o.y ?? o.position?.y ?? 0; return this; }
}

export class Graphics extends Node2D {
  zIndex = 0; visible = true; alpha = 1; tint = 0xffffff;
  userData: any; blendMode = 'normal'; parent: any = null;
  commands: string[] = [];
  private chain(v = this) { return v; }
  rect(..._a: any[]) { this.commands.push('r'); return this.chain(); }
  roundRect(..._a: any[]) { this.commands.push('rr'); return this.chain(); }
  circle(..._a: any[]) { this.commands.push('c'); return this.chain(); }
  ellipse(..._a: any[]) { this.commands.push('e'); return this.chain(); }
  poly(..._a: any[]) { this.commands.push('p'); return this.chain(); }
  moveTo(..._a: any[]) { return this.chain(); }
  lineTo(..._a: any[]) { return this.chain(); }
  fill(..._a: any[]) { return this.chain(); }
  stroke(..._a: any[]) { return this.chain(); }
  clear() { this.commands = []; return this; }
  destroy() {}
  addChild(...c: any[]) { c.forEach(x => x.parent = this); return c[0]; }
}

export class Container extends Node2D {
  children: any[] = []; zIndex = 0; visible = true; alpha = 1; tint = 0xffffff;
  parent: any = null; sortableChildren = false; eventMode = 'none'; hitArea: any = null;
  addChild<T>(...c: T[]): T { c.forEach(x => { (x as any).parent = this; this.children.push(x); }); return c[0]; }
  removeChild(...c: any[]) { this.children = this.children.filter(x => !c.includes(x)); return c[0]; }
  removeChildren() { this.children = []; }
  destroy(_a?: any) { this.children = []; }
  on(..._a: any[]) { return this; }
  emit(..._a: any[]) {}
}

export class Sprite extends Container {
  texture: any; blendMode = 'normal';
  constructor(t?: any) { super(); this.texture = t; }
}

export class Text extends Container {
  anchor = { set() {} };
  constructor(_t?: any, _s?: any) { super(); }
}

export class TextStyle { constructor(_o?: any) {} }

export class Texture {
  static from(_c: any) { return { width: 8, height: 8 }; }
  destroy(_a?: boolean) {}
}

export class RenderTexture extends Texture {
  static create(_o?: any) { return new RenderTexture(); }
}

export class Application {
  canvas: any = { style: {} };
  stage = new Container();
  screen = { width: 1280, height: 720 };
  ticker: any = { add() {}, remove() {}, deltaMS: 16.6 };
  renderer = {
    width: 1280, height: 720,
    generateTexture: () => new Texture(),
    render: () => {},
    resize: () => {},
  };
  async init(_o?: any) {}
}
