/**
 * Envía una notificación al canal configurado.
 * Prioridad: Discord (webhook) y si no, ntfy.
 * Devuelve el canal usado o null si no hay ninguno configurado.
 */
export async function sendNotification(
  title: string,
  body: string,
): Promise<{ sent: boolean; channel: string | null }> {
  const discord = process.env.DISCORD_WEBHOOK_URL?.trim();
  if (discord) {
    try {
      const res = await fetch(discord, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ content: `**${title}**\n${body}` }),
      });
      return { sent: res.ok, channel: "discord" };
    } catch {
      return { sent: false, channel: "discord" };
    }
  }

  const topic = process.env.NTFY_TOPIC?.trim();
  if (topic) {
    try {
      const res = await fetch(`https://ntfy.sh/${encodeURIComponent(topic)}`, {
        method: "POST",
        headers: {
          Title: title,
          Tags: "soccer",
          Priority: "default",
        },
        body,
      });
      return { sent: res.ok, channel: "ntfy" };
    } catch {
      return { sent: false, channel: "ntfy" };
    }
  }

  return { sent: false, channel: null };
}

export type EmbedField = { name: string; value: string; inline?: boolean };

export type Embed = {
  title: string;
  description?: string;
  color?: number;
  fields?: EmbedField[];
  footer?: { text: string };
  timestamp?: string;
};

export const COLORS = {
  green: 0x4ade80,
  blue: 0x60a5fa,
  amber: 0xfbbf24,
  red: 0xfb7185,
} as const;

/** Tarjetas bonitas en Discord. Si no hay webhook, cae a texto en ntfy. */
export async function sendEmbeds(
  embeds: Embed[],
): Promise<{ sent: boolean; channel: string | null }> {
  if (embeds.length === 0) return { sent: false, channel: null };

  const discord = process.env.DISCORD_WEBHOOK_URL?.trim();
  if (discord) {
    try {
      const res = await fetch(discord, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ embeds: embeds.slice(0, 10) }),
      });
      return { sent: res.ok, channel: "discord" };
    } catch {
      return { sent: false, channel: "discord" };
    }
  }

  const topic = process.env.NTFY_TOPIC?.trim();
  if (topic) {
    const body = embeds
      .slice(0, 10)
      .map((embed) => {
        const fields = (embed.fields ?? [])
          .map((field) => `${field.name}: ${field.value}`)
          .join("\n");
        const footer = embed.footer?.text ? `\n${embed.footer.text}` : "";
        return `${embed.title}\n${embed.description ?? ""}\n${fields}${footer}`.trim();
      })
      .join("\n\n");

    try {
      const res = await fetch(`https://ntfy.sh/${encodeURIComponent(topic)}`, {
        method: "POST",
        headers: {
          Title: embeds[0].title.slice(0, 120),
          Tags: "soccer",
          Priority: "default",
        },
        body,
      });
      return { sent: res.ok, channel: "ntfy" };
    } catch {
      return { sent: false, channel: "ntfy" };
    }
  }

  return { sent: false, channel: null };
}
