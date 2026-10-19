import type { ReactNode } from "react";
import { Link } from "react-router";
import { PageHeader } from "@/components/PageHeader";

function Part({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="card mt-4 flex flex-col gap-3 p-6" aria-labelledby={`${title}-h`}>
      <h2 id={`${title}-h`} className="text-[1.25rem]">{title}</h2>
      {children}
    </section>
  );
}

/** /privacy: how Stoga.study uses a student's data, in plain words. */
export default function Privacy() {
  return (
    <>
      <PageHeader title="How Stoga.study uses your data">The short version: your work is yours. It's used to help you study, it's never sold, and there are no ads.</PageHeader>

      <Part title="What the AI sees, and when">
        <p>Stoga.study's AI only sees something when you use a feature that needs it:</p>
        <ul className="ml-5 list-disc space-y-1">
          <li><b>Making a study set:</b> the text of that file (and a photo or scanned page, to read it).</li>
          <li><b>The tutor:</b> your question, the conversation so far, and the passages from your files and your own notes that answer it.</li>
          <li><b>The coach:</b> what you ask, plus your classes, upcoming calendar and a summary of your progress, so it can plan with you.</li>
          <li><b>Checking an answer:</b> your answer and the notes it's checked against.</li>
        </ul>
        <p>Most features run on Mercury, a model from Inception. Reading photos and scanned pages runs on OpenAI, and if Mercury is ever unavailable, your request goes to OpenAI instead. We've turned off Inception's setting that lets it train on what we send, and OpenAI's terms for its service for apps say what's sent isn't used to train their models. If you use your own key, your requests go to the AI service you chose, under its terms.</p>
      </Part>

      <Part title="What's kept">
        <ul className="ml-5 list-disc space-y-1">
          <li>Your files, study sets, flashcards, notes, calendar and tutor conversations are kept in your account, private to you, until you delete them.</li>
          <li>To count your allowance and pay the AI bill, we record how much each feature was used, not what you wrote.</li>
          <li>If you report something the AI got wrong, a copy of that item is kept so it can be fixed.</li>
        </ul>
      </Part>

      <Part title="What other students can see">
        <ul className="ml-5 list-disc space-y-1">
          <li>Nothing, unless you share it. A share link or a study group only shows the study set you chose, with your first name.</li>
          <li>If a classmate uploads the exact same file and asks for the same things, they may get a copy of what the AI made for you: never your name, your edits, your own notes or your progress. You can turn this off.</li>
        </ul>
      </Part>

      <Part title="Your controls">
        <ul className="ml-5 list-disc space-y-1">
          <li>Delete any file (open it and choose Delete), any tutor conversation, or your chat with the coach.</li>
          <li>Turn off sharing your study sets with classmates who have the same file.</li>
          <li>Download everything as a zip, any time.</li>
          <li>Delete your account and everything in it.</li>
        </ul>
        <p>All of these are in <Link to="/settings#privacy" className="underline">Settings</Link>.</p>
      </Part>

      <p className="mt-6 text-[0.875rem] text-muted">Stoga.study is in a private beta. This page explains how the app works today in plain words; it isn't a legal policy. Questions? <Link to="/feedback?from=privacy" className="underline">Send feedback</Link>.</p>
    </>
  );
}
