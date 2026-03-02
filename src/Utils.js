export const Utils = {
    sanitizeName(name) {
        if (typeof name !== 'string') return "Player";
        // Sanitize: allow only letters, numbers, spaces, - and _
        let clean = name.replace(/[^a-zA-Z0-9 _-]/g, '');
        if (clean.length > 12) clean = clean.substring(0, 12);
        return clean.trim() || "Player";
    }
};
