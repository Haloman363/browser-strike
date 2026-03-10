export const Utils = {
    sanitizeName(name) {
        if (typeof name !== 'string') return "Player";
        // Sanitize: allow only letters, numbers, spaces, - and _
        let clean = name.replace(/[^a-zA-Z0-9 _-]/g, '');
        if (clean.length > 12) clean = clean.substring(0, 12);
        return clean.trim() || "Player";
    },

    getGaussian(stdDev = 1) {
        let u = 0, v = 0;
        while(u === 0) u = Math.random(); 
        while(v === 0) v = Math.random();
        return Math.sqrt(-2.0 * Math.log(u)) * Math.cos(2.0 * Math.PI * v) * stdDev;
    }
};
