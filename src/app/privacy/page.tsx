import type { Metadata } from "next";
import Link from "next/link";
import Logo from "@/components/Logo";
import { APP_NAME } from "@/lib/settings";

export const metadata: Metadata = { title: `Privacy · ${APP_NAME}` };

export default function Privacy() {
  const days = Number(process.env.RETENTION_DAYS) || null;
  return (
    <main className="doc">
      <Link href="/" className="brand" aria-label="Back to chat">
        <Logo size={36} />
        <span className="wordmark">{APP_NAME}</span>
      </Link>
      <h1>Privacy at {APP_NAME}</h1>
      <p>
        This site lets you talk with an AI assistant. The AI acts as a privacy shield between you and the owner of{" "}
        {APP_NAME}: the owner never sees your words, and sees nothing at all unless you choose to send it.
      </p>

      <h2>What the owner can see</h2>
      <ul>
        <li>Nothing from a conversation until you press <b>Send to owner</b>.</li>
        <li>
          When you press it, an AI writes a short summary. You see that exact summary first and decide whether to send
          it. The summary paraphrases instead of quoting you, and removes names, places, employers, and other
          identifying details. Ask the AI to leave something out and it will.
        </li>
        <li>
          One exception: if a conversation you send suggests someone may be at risk of serious harm, the summary
          notes that in general terms.
        </li>
        <li>
          The owner also sees basic activity counts (for example, how many messages were sent today) and the random
          name your browser was given, such as <code>quiet-otter-42</code>.
        </li>
      </ul>

      <h2>What is stored</h2>
      <ul>
        <li>
          <b>Your messages and the AI&rsquo;s replies</b>, encrypted with a key derived from a secret cookie that exists
          only in your browser. The site stores only a fingerprint of that cookie, so neither the owner nor anyone with
          access to the database can read your conversations.
        </li>
        <li><b>Summaries you choose to send</b>, which the owner can read. The owner may also receive them by email (delivered through the email service Resend).</li>
        <li><b>A random name</b> for your browser, plus timestamps and message counts.</li>
        <li>We do not ask for or store your name, email address, or IP address.</li>
      </ul>

      <h2>The AI provider</h2>
      <p>
        Your messages are sent to Anthropic&rsquo;s API to generate replies and summaries. Anthropic processes them
        under its own commercial terms and privacy policy. So while the owner can&rsquo;t read your conversations, they
        aren&rsquo;t absolutely secret. Please don&rsquo;t share anything you would never want processed by an AI
        service.
      </p>

      <h2>Keeping and deleting your data</h2>
      <ul>
        <li>You can delete any of your conversations from the chat at any time. This removes it permanently, including any summary you sent.</li>
        <li>If you clear your browser&rsquo;s cookies, your past conversations can no longer be decrypted by anyone, including you.</li>
        <li>
          {days
            ? `Conversations with no activity for ${days} days are deleted automatically.`
            : "Conversations are kept until you or the owner delete them."}
        </li>
      </ul>

      <h2>If you&rsquo;re in crisis</h2>
      <p>
        The owner can&rsquo;t identify or contact you. If you&rsquo;re in danger, contact your local emergency number, or
        find a free, confidential helpline at <a href="https://findahelpline.com" target="_blank" rel="noreferrer">findahelpline.com</a>{" "}
        (in the US, call or text 988).
      </p>
    </main>
  );
}
