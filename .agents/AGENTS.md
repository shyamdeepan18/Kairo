# UI & Design System Rules

**UI Implementation Rule**
When building new UI components, features, or pages for this project:
1. **MANDATORY**: ALWAYS use Tailwind CSS utility classes. 
2. Do not use plain CSS or rely exclusively on Ant Design component stylings unless explicitly needed.
3. Aim for a modern, "Interactive React" style:
   - Use custom layouts with Tailwind (e.g., flexbox, grids).
   - Use interactive elements like segmented controls over basic switches.
   - Employ proper dual-theme aesthetics using Tailwind `dark:` variants everywhere (e.g., `bg-white dark:bg-slate-900`, `text-slate-900 dark:text-white`, `border-slate-200 dark:border-slate-700`).
   - Never build a light-mode only component. Every color class must have a `dark:` counterpart.
   - Use glassmorphism, glowing status pills, and trend indicators to make the UI look premium.
   - Rely on Lucide icons for visual consistency.
