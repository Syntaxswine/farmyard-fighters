// Small, monochrome symbols stay legible at the portrait controls' actual size.
const wrap=(body,box)=>`<svg viewBox="${box}" aria-hidden="true" focusable="false" fill="currentColor">${body}</svg>`;
const standing='<circle cx="10" cy="5" r="3"/><path d="M7 9h6l2 8 5 2-1 3-7-3-1-4v7l3 9h-4l-3-8-1 8H2l2-12 1-8Z"/>';
const kneeling='<circle cx="10" cy="6" r="3"/><path d="M6 10h7l3 6 7 1v3h-9l-3-4v7l9 1v7H8v-3h8v-1l-11-1-2-5 2-9Z"/>';
const prone='<circle cx="24" cy="18" r="3"/><path d="m1 23 7-3 12 1 3 3 6 1v4h-9l-3-4-8 1-7 4H0v-4l5-2Z"/>';
export const STANCE_ICONS={standing:wrap(standing,'-4 0 30 34'),kneeling:wrap(kneeling,'-2 0 30 34'),prone:wrap(prone,'-2 0 34 34')};
export const BACKPACK_ICON=wrap('<path d="M9 6V4a5 5 0 0 1 10 0v2h-3V4a2 2 0 0 0-4 0v2ZM6 6h16a3 3 0 0 1 3 3v18a3 3 0 0 1-3 3H6a3 3 0 0 1-3-3V9a3 3 0 0 1 3-3Z"/><path d="M6 10h16v5H6Zm2 10h12v7H8Z" fill="none" stroke="var(--icon-cutout,#ddcba2)" stroke-width="2"/><path d="M12 13h4v5h-4Z"/>','0 0 28 32');
