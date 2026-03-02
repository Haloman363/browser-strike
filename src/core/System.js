/**
 * Base class for all game systems.
 * Systems are responsible for logic and should be independent.
 */
export class System {
    constructor(engine) {
        this.engine = engine;
        this.name = this.constructor.name;
        this.enabled = true;
    }

    /**
     * Called when the system is registered with the engine.
     */
    init() {
        // To be implemented by subclasses
    }

    /**
     * Called every frame.
     * @param {number} delta Time since last frame in seconds.
     * @param {number} time Total elapsed time in seconds.
     */
    update(delta, time) {
        // To be implemented by subclasses
    }

    /**
     * Called when the system is removed from the engine.
     */
    destroy() {
        // To be implemented by subclasses
    }
}
