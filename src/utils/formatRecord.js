
export const DATE_FIELDS = [
  "fecha", "fechaHora", "fechaEvento", "fechaCreacion", "fechaInicio",
  "fechaFin", "fechaSalida", "fechaEntrada", "createdAt", "updatedAt", "fechaRelacion", "ultimaModificacion",
];

export function parseRecordDate(value) {
  if (value == null || value === "") return null;

  let date = null;

  if (value instanceof Date) {
    date = value;
  } else if (typeof value === "object" && !Array.isArray(value)) {
    if (typeof value.toDate === "function") {
      date = value.toDate();
    } else {
      const seconds = value.seconds ?? value._seconds;
      const nanos = value.nanoseconds ?? value._nanoseconds ?? 0;

      if (typeof seconds === "number" && Number.isFinite(seconds)) {
        date = new Date(seconds * 1000 + Number(nanos) / 1e6);
      }
    }
  } else if (typeof value === "string" || typeof value === "number") {
    const local = typeof value === "string" && /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(value);
    const calendar = local ? `${local[3]}-${local[2]}-${local[1]}` : value;
    date = new Date(typeof calendar === "string" && /^\d{4}-\d{2}-\d{2}$/.test(calendar) ? `${calendar}T12:00:00-03:00` : calendar);
  }

  return date instanceof Date && Number.isFinite(date.getTime())
    ? date
    : null;
}

export function recordDay(date) {
  const parts = new Intl.DateTimeFormat("en", { timeZone: "America/Argentina/Buenos_Aires", year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(date);
  const part = type => parts.find(item => item.type === type).value;
  return `${part("year")}-${part("month")}-${part("day")}`;
}

export function formatRecordDate(value) {
  const date = parseRecordDate(value);
  return date ? new Intl.DateTimeFormat("es-AR", { timeZone: "America/Argentina/Buenos_Aires", day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit", second: "2-digit", hourCycle: "h23" }).format(date) : "—";
}

export function formatRecordValue(value, depth = 0) {
  if (value == null) return "—";
  if (typeof value === "boolean") return value ? "Sí" : "No";

  const isTimestamp = value instanceof Date || (
    value &&
    typeof value === "object" &&
    !Array.isArray(value) &&
    (
      typeof value.toDate === "function" ||
      typeof (value.seconds ?? value._seconds) === "number"
    )
  );

  if (isTimestamp) {
    return formatRecordDate(value);
  }

  if (Array.isArray(value)) {
    return value.length
      ? value
        .map(
          (item, index) =>
            `${index + 1}. ${formatRecordValue(item, depth + 1)}`
        )
        .join("\n")
      : "Sin elementos";
  }

  if (typeof value === "object") {
    return Object.entries(value)
      .map(
        ([key, item]) =>
          `${key}: ${formatRecordValue(item, depth + 1)}`
      )
      .join(depth ? " · " : "\n");
  }

  return String(value);
}

export function recordDate(item) {
  for (const key of DATE_FIELDS) {
    const date = parseRecordDate(item?.[key]);

    if (date) return date;
  }

  return null;
}

export function dateToIso(value) {
  if (!value) return "";

  const match = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(value);
  if (!match) return "";

  const iso = `${match[3]}-${match[2]}-${match[1]}`;
  const date = new Date(`${iso}T12:00:00`);

  return Number.isFinite(date.getTime()) &&
    date.getDate() === Number(match[1]) &&
    date.getMonth() + 1 === Number(match[2])
    ? iso
    : "";
}
