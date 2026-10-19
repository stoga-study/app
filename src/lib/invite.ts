// The invite-a-classmate message: short, friendly, no rewards. Pure, unit tested.

export function inviteMessage(o: { firstName: string | null; className?: string | null; groupName?: string | null; url: string }) {
  const intro = o.groupName
    ? `Join my study group "${o.groupName}" on Stoga.study`
    : o.className
      ? `Want to study ${o.className} together? I'm using Stoga.study`
      : "I've been using Stoga.study to study";
  const what = "It's made for Stoga: it already has our classes, syncs with Schoology and plans around our tests. And it's free.";
  return `${intro}. ${what} ${o.url}${o.firstName ? `\n\n– ${o.firstName}` : ""}`;
}

/** A text-message link that works on iPhone and Android. */
export const smsLink = (body: string, ios: boolean) => `sms:${ios ? "&" : "?"}body=${encodeURIComponent(body)}`;
