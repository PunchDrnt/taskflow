import { paletteClasses, paletteFamilies, Swatch } from '../_lib/shared'

export default function ColorsPage() {
  return (
    <div className="flex flex-col gap-6 py-8">
      {paletteFamilies.map((family) => {
        const swatches = paletteClasses[family]
        return (
          <div key={family} className="flex flex-col gap-2">
            <h3 className="label-medium text-text-secondary capitalize">
              {family}
            </h3>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              <Swatch label={`${family}-main`} className={swatches.main} />
              <Swatch label={`${family}-dark`} className={swatches.dark} />
              <Swatch label={`${family}-light`} className={swatches.light} />
              <Swatch
                label={`${family}-contrast`}
                className={swatches.contrast}
              />
            </div>
          </div>
        )
      })}

      <div className="flex flex-col gap-2">
        <h3 className="label-medium text-text-secondary">
          Interaction states (primary)
        </h3>
        <div className="grid grid-cols-3 gap-3 sm:grid-cols-6">
          <Swatch label="soft" className="bg-primary-soft" />
          <Swatch label="hover" className="bg-primary-hover" />
          <Swatch label="selected" className="bg-primary-selected" />
          <Swatch label="focus" className="bg-primary-focus" />
          <Swatch label="focus-visible" className="bg-primary-focus-visible" />
          <Swatch
            label="outlined-border"
            className="bg-primary-outlined-border"
          />
        </div>
      </div>

      <div className="flex flex-col gap-2">
        <h3 className="label-medium text-text-secondary">
          Neutral &amp; surface tokens
        </h3>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <Swatch label="black-main" className="bg-black-main" />
          <Swatch label="white-main" className="bg-white-main" />
          <Swatch label="action-hover" className="bg-action-hover" />
          <Swatch label="action-selected" className="bg-action-selected" />
          <Swatch
            label="action-disabled-background"
            className="bg-action-disabled-background"
          />
          <Swatch label="divider" className="bg-divider" />
        </div>
      </div>

      <div className="flex flex-col gap-2">
        <h3 className="label-medium text-text-secondary">Paper elevation</h3>
        <div className="grid grid-cols-4 gap-3 sm:grid-cols-8">
          <Swatch label="elevation-0" className="bg-paper-elevation-0" />
          <Swatch label="elevation-2" className="bg-paper-elevation-2" />
          <Swatch label="elevation-4" className="bg-paper-elevation-4" />
          <Swatch label="elevation-6" className="bg-paper-elevation-6" />
          <Swatch label="elevation-8" className="bg-paper-elevation-8" />
          <Swatch label="elevation-10" className="bg-paper-elevation-10" />
          <Swatch label="elevation-12" className="bg-paper-elevation-12" />
          <Swatch label="elevation-15" className="bg-paper-elevation-15" />
        </div>
      </div>
    </div>
  )
}
