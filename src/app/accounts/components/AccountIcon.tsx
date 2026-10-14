import type { FC } from "react";

export function AccountIcon({
  type,
}: {
  type: "people" | "shield" | "mail" | "clock";
}) {
  if (type === "people")
    return (
      <svg viewBox="0 0 20 20" fill="none" aria-hidden="true">
        <path
          d="M13.5 16.5v-1.3a2.7 2.7 0 0 0-2.7-2.7H5.2a2.7 2.7 0 0 0-2.7 2.7v1.3m11.2-9.7a2.7 2.7 0 0 1 0 5.3m3 4.4v-1.3a2.7 2.7 0 0 0-2-2.6M8 10a3.3 3.3 0 1 0 0-6.6A3.3 3.3 0 0 0 8 10Z"
          stroke="currentColor"
          strokeWidth="1.5"
          strokeLinecap="round"
        />
      </svg>
    );
  if (type === "shield")
    return (
      <svg viewBox="0 0 20 20" fill="none" aria-hidden="true">
        <path
          d="m10 2.5-6 2.4v4.4c0 3.4 2.2 6.3 6 8.2 3.8-1.9 6-4.8 6-8.2V4.9l-6-2.4Z"
          stroke="currentColor"
          strokeWidth="1.5"
          strokeLinejoin="round"
        />
        <path
          d="m7.5 9.7 1.6 1.6 3.4-3.5"
          stroke="currentColor"
          strokeWidth="1.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    );
  if (type === "clock")
    return (
      <svg viewBox="0 0 20 20" fill="none" aria-hidden="true">
        <circle cx="10" cy="10" r="7" stroke="currentColor" strokeWidth="1.5" />
        <path
          d="M10 6v4l2.7 1.7"
          stroke="currentColor"
          strokeWidth="1.5"
          strokeLinecap="round"
        />
      </svg>
    );
  return (
    <svg viewBox="0 0 20 20" fill="none" aria-hidden="true">
      <path
        d="m3 5.5 7 5.2 7-5.2M4.5 4h11A1.5 1.5 0 0 1 17 5.5v9a1.5 1.5 0 0 1-1.5 1.5h-11A1.5 1.5 0 0 1 3 14.5v-9A1.5 1.5 0 0 1 4.5 4Z"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinejoin="round"
      />
    </svg>
  );
}
