"use client";

export default function TransitDetailError({ reset }: { reset: () => void }) {
  return (
    <main className="main-content">
      <h1>暂时无法读取中转站数据</h1>
      <p>请稍后重试。这不表示该中转站已被删除。</p>
      <button onClick={reset}>重试</button>
    </main>
  );
}
