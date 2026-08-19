const samples = [
  ['display-1', 'h1'],
  ['display-2', 'h2'],
  ['display-3', 'h3'],
  ['h4', 'h4'],
  ['h5', 'h5'],
  ['h6', 'h6'],
  ['subtitle-1', 'subtitle-1'],
  ['body-1', 'body-1'],
  ['body-2', 'body-2'],
  ['caption', 'caption'],
]

export default function TypographyPage() {
  return (
    <div className="flex flex-col gap-3 py-8">
      {samples.map(([className, name]) => (
        <div key={name} className="flex items-baseline gap-4">
          <span className="caption text-text-secondary w-24 shrink-0">
            .{name}
          </span>
          <p className={className}>
            The quick brown fox jumps over the lazy dog
          </p>
        </div>
      ))}
    </div>
  )
}
