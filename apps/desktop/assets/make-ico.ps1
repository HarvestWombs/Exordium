# Builds Exordium's multi-resolution Windows .ico from its square PNG.
#
# Windows picks a size per context: 16px for the title bar and Alt+Tab, 32px for the taskbar, 48px in
# Explorer, 256px for large tiles and the Start menu. An .ico with only one size gets scaled by the
# shell for the rest. Each entry is stored as a PNG, which Vista and later accept at any size, and
# which keeps the alpha channel. The .ico is committed; run this again when the artwork changes:
#
#   powershell -File apps/desktop/assets/make-ico.ps1

param(
  [string]$Source = "$PSScriptRoot\exordium-icon.png",
  [string]$Out = "$PSScriptRoot\exordium.ico"
)

Add-Type -AssemblyName System.Drawing

$sizes = @(16, 24, 32, 48, 64, 128, 256)
$image = [System.Drawing.Image]::FromFile((Resolve-Path $Source).Path)
$pngs = @()
foreach ($size in $sizes) {
  $bitmap = New-Object System.Drawing.Bitmap $size, $size
  $graphics = [System.Drawing.Graphics]::FromImage($bitmap)
  $graphics.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
  $graphics.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality
  $graphics.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::HighQuality
  $graphics.Clear([System.Drawing.Color]::Transparent)
  $graphics.DrawImage($image, 0, 0, $size, $size)
  $graphics.Dispose()
  $stream = New-Object System.IO.MemoryStream
  $bitmap.Save($stream, [System.Drawing.Imaging.ImageFormat]::Png)
  $bitmap.Dispose()
  $pngs += , $stream.ToArray()
}
$image.Dispose()

# ICONDIR (6 bytes), one 16-byte ICONDIRENTRY per image, then the images. Not `$out`: PowerShell
# names ignore case, so that is the `[string]$Out` parameter and the stream would become a string.
$buffer = New-Object System.IO.MemoryStream
$writer = New-Object System.IO.BinaryWriter $buffer
$writer.Write([UInt16]0)
$writer.Write([UInt16]1)
$writer.Write([UInt16]$sizes.Count)
$offset = 6 + 16 * $sizes.Count
for ($i = 0; $i -lt $sizes.Count; $i++) {
  $size = $sizes[$i]
  $edge = if ($size -ge 256) { 0 } else { $size } # 0 means 256: the field is one byte
  $writer.Write([Byte]$edge)
  $writer.Write([Byte]$edge)
  $writer.Write([Byte]0)   # palette colours
  $writer.Write([Byte]0)   # reserved
  $writer.Write([UInt16]1) # colour planes
  $writer.Write([UInt16]32) # bits per pixel
  $writer.Write([UInt32]$pngs[$i].Length)
  $writer.Write([UInt32]$offset)
  $offset += $pngs[$i].Length
}
foreach ($png in $pngs) { $writer.Write($png) }
$writer.Flush()
[System.IO.File]::WriteAllBytes($Out, $buffer.ToArray())
Write-Host "Wrote $Out ($($sizes -join ', ') px)"
