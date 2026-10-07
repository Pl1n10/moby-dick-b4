// Bootstrap Icons (official icon font, bootstrap-icons on npm). Takes the
// color of the surrounding text (currentColor), so icons follow the theme
// like any other text — emoji did not. Decorative by default: give the
// parent button/span a title or aria-label for meaning.
export default function Icon({ name, size, style, title }) {
  return (
    <i
      className={`bi bi-${name}`}
      aria-hidden={title ? undefined : true}
      title={title}
      style={{ fontSize: size, lineHeight: 1, verticalAlign: '-0.125em', ...style }}
    />
  )
}
