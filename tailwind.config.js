/** @type {import('tailwindcss').Config} */
module.exports = {
    content: [
        "./src/**/*.{html,ts}",
    ],
    theme: {
        extend: {
            colors: {
                'muted-foreground': 'hsl(var(--muted-foreground))',
                'secondary-foreground': 'hsl(var(--secondary-foreground))',
                'destructive': 'hsl(var(--destructive))',
                'destructive-foreground': 'hsl(var(--destructive-foreground))',
                'primary': 'hsl(var(--primary))',
                'primary-foreground': 'hsl(var(--primary-foreground))',
                'secondary': 'hsl(var(--secondary))',
                'muted': 'hsl(var(--muted))',
                'accent': 'hsl(var(--accent))',
                'accent-foreground': 'hsl(var(--accent-foreground))',
                'popover': 'hsl(var(--popover))',
                'popover-foreground': 'hsl(var(--popover-foreground))',
                'card': 'hsl(var(--card))',
                'card-foreground': 'hsl(var(--card-foreground))',
                'border': 'hsl(var(--border))',
                'input': 'hsl(var(--input))',
                'ring': 'hsl(var(--ring))',
                'background': 'hsl(var(--background))',
                'foreground': 'hsl(var(--foreground))',
            },
        },
    },
    plugins: [],
}
