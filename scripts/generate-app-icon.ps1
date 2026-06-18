$ErrorActionPreference = 'Stop'

Add-Type -AssemblyName System.Drawing

$root = Split-Path -Parent (Split-Path -Parent $MyInvocation.MyCommand.Path)
$assetDir = Join-Path $root 'assets'
New-Item -ItemType Directory -Force -Path $assetDir | Out-Null

$size = 256
$bitmap = New-Object System.Drawing.Bitmap $size, $size, ([System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
$graphics = [System.Drawing.Graphics]::FromImage($bitmap)
$graphics.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
$graphics.TextRenderingHint = [System.Drawing.Text.TextRenderingHint]::AntiAliasGridFit

function New-RoundRectPath([float]$x, [float]$y, [float]$w, [float]$h, [float]$r) {
  $path = New-Object System.Drawing.Drawing2D.GraphicsPath
  $d = $r * 2
  $path.AddArc($x, $y, $d, $d, 180, 90)
  $path.AddArc($x + $w - $d, $y, $d, $d, 270, 90)
  $path.AddArc($x + $w - $d, $y + $h - $d, $d, $d, 0, 90)
  $path.AddArc($x, $y + $h - $d, $d, $d, 90, 90)
  $path.CloseFigure()
  return $path
}

function New-Brush([string]$hex) {
  return New-Object System.Drawing.SolidBrush ([System.Drawing.ColorTranslator]::FromHtml($hex))
}

$bgPath = New-RoundRectPath 0 0 256 256 52
$bgBrush = New-Object System.Drawing.Drawing2D.LinearGradientBrush `
  ([System.Drawing.PointF]::new(28, 16)), `
  ([System.Drawing.PointF]::new(228, 246)), `
  ([System.Drawing.ColorTranslator]::FromHtml('#5FCBFF')), `
  ([System.Drawing.ColorTranslator]::FromHtml('#A59BFF'))
$graphics.FillPath($bgBrush, $bgPath)

$shadowBrush = New-Brush '#5579DF'
$graphics.FillEllipse($shadowBrush, 66, 196, 124, 18)
$shadowBrush.Dispose()

$cardPath = New-RoundRectPath 32 42 78 74 14
$cardBrush = New-Brush '#F4F7FF'
$graphics.FillPath($cardBrush, $cardPath)
$cardTopBrush = New-Brush '#6D81FF'
$graphics.FillRectangle($cardTopBrush, 32, 42, 78, 20)
$cardBrush.Dispose()
$cardTopBrush.Dispose()

$whitePen = New-Object System.Drawing.Pen ([System.Drawing.Color]::White), 4
$blueBrush = New-Brush '#2F86FF'
foreach ($y in 76, 99) {
  $graphics.FillEllipse($blueBrush, 48, $y - 10, 20, 20)
  $graphics.DrawLines($whitePen, @(
    [System.Drawing.PointF]::new(52, $y),
    [System.Drawing.PointF]::new(56, $y + 4),
    [System.Drawing.PointF]::new(64, $y - 6)
  ))
}
$linePen = New-Object System.Drawing.Pen ([System.Drawing.ColorTranslator]::FromHtml('#B7C2E6')), 6
$linePen.StartCap = [System.Drawing.Drawing2D.LineCap]::Round
$linePen.EndCap = [System.Drawing.Drawing2D.LineCap]::Round
$graphics.DrawLine($linePen, 75, 74, 100, 74)
$graphics.DrawLine($linePen, 75, 98, 96, 98)

$bellBrush = New-Object System.Drawing.Drawing2D.LinearGradientBrush `
  ([System.Drawing.PointF]::new(178, 42)), `
  ([System.Drawing.PointF]::new(224, 112)), `
  ([System.Drawing.ColorTranslator]::FromHtml('#FFE98A')), `
  ([System.Drawing.ColorTranslator]::FromHtml('#FF9D1F'))
$bellPath = New-Object System.Drawing.Drawing2D.GraphicsPath
$bellPath.AddBezier(188, 43, 214, 40, 220, 62, 215, 88)
$bellPath.AddLine(215, 88, 226, 104)
$bellPath.AddLine(226, 104, 170, 97)
$bellPath.AddLine(170, 97, 183, 86)
$bellPath.AddBezier(183, 86, 181, 62, 176, 47, 188, 43)
$bellPath.CloseFigure()
$graphics.FillPath($bellBrush, $bellPath)
$orangeBrush = New-Brush '#EA7B14'
$graphics.FillEllipse($orangeBrush, 185, 96, 16, 16)

$ringPenWide = New-Object System.Drawing.Pen ([System.Drawing.ColorTranslator]::FromHtml('#A5F4FF')), 22
$ringPenWide.StartCap = [System.Drawing.Drawing2D.LineCap]::Round
$ringPenWide.EndCap = [System.Drawing.Drawing2D.LineCap]::Round
$graphics.DrawBezier($ringPenWide, 30, 150, 74, 112, 166, 99, 220, 126)
$ringPen = New-Object System.Drawing.Pen ([System.Drawing.Color]::White), 9
$ringPen.StartCap = [System.Drawing.Drawing2D.LineCap]::Round
$ringPen.EndCap = [System.Drawing.Drawing2D.LineCap]::Round
$graphics.DrawBezier($ringPen, 30, 150, 82, 178, 172, 171, 220, 126)

$planetBrush = New-Object System.Drawing.Drawing2D.LinearGradientBrush `
  ([System.Drawing.PointF]::new(82, 78)), `
  ([System.Drawing.PointF]::new(178, 190)), `
  ([System.Drawing.Color]::White), `
  ([System.Drawing.ColorTranslator]::FromHtml('#C6D7FF'))
$graphics.FillEllipse($planetBrush, 74, 76, 114, 114)
$highlightBrush = New-Brush '#FFFFFF'
$graphics.FillEllipse($highlightBrush, 92, 94, 48, 26)
$eyeBrush = New-Brush '#080A66'
$graphics.FillEllipse($eyeBrush, 103, 124, 17, 31)
$graphics.FillEllipse($eyeBrush, 143, 124, 17, 31)
$graphics.FillEllipse($highlightBrush, 111, 130, 5, 5)
$graphics.FillEllipse($highlightBrush, 151, 130, 5, 5)
$smilePen = New-Object System.Drawing.Pen ([System.Drawing.ColorTranslator]::FromHtml('#080A66')), 5
$graphics.DrawArc($smilePen, 122, 145, 24, 18, 20, 140)
$blushBrush = New-Brush '#FF8BC2'
$graphics.FillEllipse($blushBrush, 78, 151, 30, 18)
$graphics.FillEllipse($blushBrush, 156, 151, 30, 18)

$greenPen = New-Object System.Drawing.Pen ([System.Drawing.ColorTranslator]::FromHtml('#7DE246')), 9
$greenPen.StartCap = [System.Drawing.Drawing2D.LineCap]::Round
$greenPen.EndCap = [System.Drawing.Drawing2D.LineCap]::Round
$graphics.DrawLine($greenPen, 62, 174, 47, 220)
$graphics.DrawLine($greenPen, 62, 174, 44, 181)
$graphics.DrawLine($greenPen, 62, 174, 78, 185)
$graphics.DrawLine($greenPen, 47, 220, 31, 229)
$graphics.DrawLine($greenPen, 47, 220, 62, 230)
$greenBrush = New-Brush '#A4F15F'
$graphics.FillEllipse($greenBrush, 55, 153, 18, 18)

$dropBrush = New-Object System.Drawing.Drawing2D.LinearGradientBrush `
  ([System.Drawing.PointF]::new(193, 154)), `
  ([System.Drawing.PointF]::new(230, 219)), `
  ([System.Drawing.ColorTranslator]::FromHtml('#DDFBFF')), `
  ([System.Drawing.ColorTranslator]::FromHtml('#65D1FF'))
$dropPath = New-Object System.Drawing.Drawing2D.GraphicsPath
$dropPath.AddBezier(213, 151, 230, 175, 235, 190, 235, 197)
$dropPath.AddBezier(235, 218, 191, 218, 191, 197, 191, 190)
$dropPath.AddBezier(191, 183, 201, 166, 213, 151, 213, 151)
$dropPath.CloseFigure()
$graphics.FillPath($dropBrush, $dropPath)

$starBrush = New-Brush '#FFFFFF'
$graphics.FillEllipse($starBrush, 178, 38, 10, 10)
$graphics.FillEllipse($starBrush, 218, 132, 8, 8)

$pngPath = Join-Path $assetDir 'app-icon.png'
$icoPath = Join-Path $assetDir 'app-icon.ico'
$bitmap.Save($pngPath, [System.Drawing.Imaging.ImageFormat]::Png)

$pngBytes = [System.IO.File]::ReadAllBytes($pngPath)
$icoHeader = New-Object byte[] 22
$icoHeader[2] = 1
$icoHeader[4] = 1
$icoHeader[10] = 1
$icoHeader[12] = 32
[System.BitConverter]::GetBytes([UInt32]$pngBytes.Length).CopyTo($icoHeader, 14)
[System.BitConverter]::GetBytes([UInt32]22).CopyTo($icoHeader, 18)
$icoBytes = New-Object byte[] ($icoHeader.Length + $pngBytes.Length)
[System.Array]::Copy($icoHeader, 0, $icoBytes, 0, $icoHeader.Length)
[System.Array]::Copy($pngBytes, 0, $icoBytes, $icoHeader.Length, $pngBytes.Length)
[System.IO.File]::WriteAllBytes($icoPath, $icoBytes)

$graphics.Dispose()
$bitmap.Dispose()
