import { describe, expect, it } from "vitest";
import { inviteMessage, smsLink } from "./invite";

describe("invite message", () => {
  it("fits the place it's sent from", () => {
    expect(inviteMessage({ firstName: "Sam", groupName: "AP Bio", url: "https://x/join/ABCD2345" })).toMatch(/^Join my study group "AP Bio" on Stoga\.study\. .* https:\/\/x\/join\/ABCD2345\n\n– Sam$/);
    expect(inviteMessage({ firstName: null, className: "Chemistry", url: "https://x" })).toMatch(/^Want to study Chemistry together\? I'm using Stoga\.study\. .*free\. https:\/\/x$/);
    expect(inviteMessage({ firstName: null, url: "https://x" })).not.toMatch(/reward|points|bonus/i);
  });
  it("makes text-message links for both phones", () => {
    expect(smsLink("hi there", true)).toBe("sms:&body=hi%20there");
    expect(smsLink("hi", false)).toBe("sms:?body=hi");
  });
});
