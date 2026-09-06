"use client";

export default function TransitDetailError({ reset }: { reset: () => void }) {
  return (
    <main className="main-content">
      <h1>Transit data is temporarily unavailable</h1>
      <p>
        Please try again later. This does not mean the station has been removed.
      </p>
      <button onClick={reset}>Try again</button>
    </main>
  );
}
