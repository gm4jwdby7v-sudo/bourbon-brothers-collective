import { Heart, MessageCircle, Repeat2 } from "lucide-react";

const posts = [
  {
    user: "Marcus K.",
    handle: "@barrelhunter",
    time: "2h",
    bottle: "Eagle Rare 17",
    text: "Finally tracked one down at MSRP. The mid-palate on this is something else — dark cherry, leather, a kiss of mint.",
    likes: 248,
    comments: 42,
  },
  {
    user: "Sara L.",
    handle: "@neat_pour",
    time: "5h",
    bottle: "Stagg Jr Batch 23",
    text: "Side-by-side with batch 19 tonight. 23 leans sweeter, 19 has more spice backbone. Both excellent.",
    likes: 187,
    comments: 31,
  },
  {
    user: "Hank R.",
    handle: "@kentuckyhank",
    time: "1d",
    bottle: "Four Roses OBSV",
    text: "Single barrel store pick from a small Louisville shop. If you can find it, grab two.",
    likes: 412,
    comments: 88,
  },
];

export function Feed() {
  return (
    <section className="mx-auto max-w-7xl px-6 py-24">
      <div className="max-w-2xl mb-12">
        <div className="text-xs uppercase tracking-[0.3em] text-primary mb-3">From the feed</div>
        <h2 className="font-display text-4xl md:text-5xl">What the community is pouring.</h2>
      </div>
      <div className="grid md:grid-cols-3 gap-5">
        {posts.map((p) => (
          <article
            key={p.handle}
            className="rounded-2xl border border-border bg-card p-6 hover:border-primary/40 transition-colors"
          >
            <div className="flex items-center gap-3 mb-4">
              <div className="h-10 w-10 rounded-full bg-gradient-amber flex items-center justify-center font-display text-primary-foreground">
                {p.user[0]}
              </div>
              <div>
                <div className="text-sm font-medium">{p.user}</div>
                <div className="text-xs text-muted-foreground">
                  {p.handle} · {p.time}
                </div>
              </div>
            </div>
            <div className="inline-block text-[10px] uppercase tracking-widest text-primary border border-primary/30 rounded-full px-2 py-0.5 mb-3">
              {p.bottle}
            </div>
            <p className="text-sm leading-relaxed text-foreground/90 mb-5">{p.text}</p>
            <div className="flex items-center gap-5 text-xs text-muted-foreground">
              <span className="flex items-center gap-1.5">
                <Heart className="h-3.5 w-3.5" />
                {p.likes}
              </span>
              <span className="flex items-center gap-1.5">
                <MessageCircle className="h-3.5 w-3.5" />
                {p.comments}
              </span>
              <span className="flex items-center gap-1.5">
                <Repeat2 className="h-3.5 w-3.5" />
                Share
              </span>
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}
