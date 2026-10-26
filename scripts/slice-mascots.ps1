# Slices the 3x2 mascot showcase grid into six character images.
# Cropped to exclude the label strip at the bottom of each cell.
Add-Type -AssemblyName System.Drawing
$src = [System.Drawing.Image]::FromFile("C:\Users\thaku\Downloads\Mascot Orb Showcase Grid.png")
$outDir = "C:\Users\thaku\hackathon-projects\GrokBot\assets\brand\characters\3d"
New-Item -ItemType Directory -Force -Path $outDir | Out-Null

$cw = [int]($src.Width / 3)     # cell width
$ch = [int]($src.Height / 2)    # cell height
$keepTop = 0.84                  # keep top 84% of each cell (labels start ~90%)

$names = @(
  @("orby", 0, 0), @("scout", 1, 0), @("forge", 2, 0),
  @("echo", 0, 1), @("tempo", 1, 1), @("sentry", 2, 1)
)

foreach ($n in $names) {
  $name = $n[0]; $col = [int]$n[1]; $row = [int]$n[2]
  $cropH = [int]($ch * $keepTop)
  $rect = New-Object System.Drawing.Rectangle ($col * $cw), ($row * $ch), $cw, $cropH
  $bmp = New-Object System.Drawing.Bitmap $cw, $cropH
  $g = [System.Drawing.Graphics]::FromImage($bmp)
  $g.DrawImage($src, (New-Object System.Drawing.Rectangle 0, 0, $cw, $cropH), $rect, [System.Drawing.GraphicsUnit]::Pixel)
  $g.Dispose()
  $out = Join-Path $outDir "$name.png"
  $bmp.Save($out, [System.Drawing.Imaging.ImageFormat]::Png)
  $bmp.Dispose()
  Write-Output "$name -> $out ($cw x $cropH)"
}
$src.Dispose()
