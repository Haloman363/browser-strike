import { System } from '../core/System.js';

export class InputSystem extends System {
    constructor(engine) {
        super(engine);
        this.keys = new Set();
        this.mouseButtons = new Set();
        this.mouseX = 0;
        this.mouseY = 0;
        
        this._onKeyDown = this.onKeyDown.bind(this);
        this._onKeyUp = this.onKeyUp.bind(this);
        this._onMouseDown = this.onMouseDown.bind(this);
        this._onMouseUp = this.onMouseUp.bind(this);
        this._onMouseMove = this.onMouseMove.bind(this);
    }

    init() {
        window.addEventListener('keydown', this._onKeyDown);
        window.addEventListener('keyup', this._onKeyUp);
        window.addEventListener('mousedown', this._onMouseDown);
        window.addEventListener('mouseup', this._onMouseUp);
        window.addEventListener('mousemove', this._onMouseMove);
        console.log("InputSystem initialized");
    }

    onKeyDown(e) {
        this.keys.add(e.code);
        this.engine.emit('input:keydown', e.code);
    }

    onKeyUp(e) {
        this.keys.delete(e.code);
        this.engine.emit('input:keyup', e.code);
    }

    onMouseDown(e) {
        this.mouseButtons.add(e.button);
        this.engine.emit('input:mousedown', e.button);
    }

    onMouseUp(e) {
        this.mouseButtons.delete(e.button);
        this.engine.emit('input:mouseup', e.button);
    }

    onMouseMove(e) {
        this.mouseX = e.clientX;
        this.mouseY = e.clientY;
        this.engine.emit('input:mousemove', { x: e.clientX, y: e.clientY, movementX: e.movementX, movementY: e.movementY });
    }

    isKeyPressed(code) {
        return this.keys.has(code);
    }

    isMouseButtonPressed(button) {
        return this.mouseButtons.has(button);
    }

    destroy() {
        window.removeEventListener('keydown', this._onKeyDown);
        window.removeEventListener('keyup', this._onKeyUp);
        window.removeEventListener('mousedown', this._onMouseDown);
        window.removeEventListener('mouseup', this._onMouseUp);
        window.removeEventListener('mousemove', this._onMouseMove);
    }
}
