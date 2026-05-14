#requires -Version 5.1
<#
.SYNOPSIS
    atlas.ico 를 GDI+ 로 직접 생성 (atlas.svg 와 동일한 도형을 그림).
    SVG → ICO 변환 도구 의존 없이 멀티사이즈 ICO 를 만든다.
.DESCRIPTION
    실행 1회로 atlas.ico 생성. 도형/색상을 바꾸려면 atlas.svg 와 이 스크립트의
    Draw 함수를 함께 갱신할 것.
#>

$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Drawing

$here = $PSScriptRoot
$outIco = Join-Path $here 'atlas.ico'

# Atlas palette
$bg     = [System.Drawing.Color]::FromArgb(0xFF, 0x14, 0x14, 0x14)
$edge   = [System.Drawing.Color]::FromArgb(0xFF, 0x5B, 0x6A, 0x8A)
$blue   = [System.Drawing.Color]::FromArgb(0xFF, 0x7C, 0x8D, 0xB5)
$gold   = [System.Drawing.Color]::FromArgb(0xFF, 0xC9, 0xA9, 0x6B)
$goldHi = [System.Drawing.Color]::FromArgb(0xB3, 0xDE, 0xC3, 0x8D)
$stroke = [System.Drawing.Color]::FromArgb(0xFF, 0x3F, 0x3F, 0x46)

function New-AtlasBitmap([int]$size) {
    $bmp = New-Object System.Drawing.Bitmap $size, $size
    $g = [System.Drawing.Graphics]::FromImage($bmp)
    $g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
    $g.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
    $g.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality

    # All coordinates assume a 256x256 master; scale to current size.
    $s = $size / 256.0
    function P([double]$v) { return [float]($v * $s) }

    # Rounded background
    $r = P 48
    $w = P 256
    $h = P 256
    $path = New-Object System.Drawing.Drawing2D.GraphicsPath
    $path.AddArc(0, 0, $r*2, $r*2, 180, 90)
    $path.AddArc($w - $r*2, 0, $r*2, $r*2, 270, 90)
    $path.AddArc($w - $r*2, $h - $r*2, $r*2, $r*2, 0, 90)
    $path.AddArc(0, $h - $r*2, $r*2, $r*2, 90, 90)
    $path.CloseFigure()
    $bgBrush = New-Object System.Drawing.SolidBrush $bg
    $g.FillPath($bgBrush, $path)
    $bgBrush.Dispose()
    $path.Dispose()

    # Edges (small node -> hub)
    $edgeWidth = [Math]::Max(1.0, 6.0 * $s)
    $edgePen = New-Object System.Drawing.Pen $edge, $edgeWidth
    $edgePen.StartCap = [System.Drawing.Drawing2D.LineCap]::Round
    $edgePen.EndCap   = [System.Drawing.Drawing2D.LineCap]::Round
    $hubX = P 128; $hubY = P 128
    foreach ($pt in @(@(76,74), @(196,80), @(72,190), @(200,196))) {
        $g.DrawLine($edgePen, (P $pt[0]), (P $pt[1]), $hubX, $hubY)
    }
    $edgePen.Dispose()

    # Small blue nodes
    $blueBrush = New-Object System.Drawing.SolidBrush $blue
    $nodeStrokeWidth = [Math]::Max(1.0, 2.0 * $s)
    $nodeStroke = New-Object System.Drawing.Pen $stroke, $nodeStrokeWidth
    $smallR = P 20
    foreach ($pt in @(@(76,74), @(196,80), @(72,190), @(200,196))) {
        $cx = P $pt[0]; $cy = P $pt[1]
        $g.FillEllipse($blueBrush, $cx - $smallR, $cy - $smallR, $smallR * 2, $smallR * 2)
        if ($size -ge 32) {
            $g.DrawEllipse($nodeStroke, $cx - $smallR, $cy - $smallR, $smallR * 2, $smallR * 2)
        }
    }
    $blueBrush.Dispose()

    # Hub: golden circle
    $goldBrush = New-Object System.Drawing.SolidBrush $gold
    $hubR = P 38
    $g.FillEllipse($goldBrush, $hubX - $hubR, $hubY - $hubR, $hubR * 2, $hubR * 2)
    $hubStrokeWidth = [Math]::Max(1.0, 3.0 * $s)
    $hubStroke = New-Object System.Drawing.Pen $stroke, $hubStrokeWidth
    if ($size -ge 32) {
        $g.DrawEllipse($hubStroke, $hubX - $hubR, $hubY - $hubR, $hubR * 2, $hubR * 2)
    }
    $goldBrush.Dispose()
    $hubStroke.Dispose()
    $nodeStroke.Dispose()

    # Highlight bubble on hub for depth
    if ($size -ge 24) {
        $hiBrush = New-Object System.Drawing.SolidBrush $goldHi
        $hiR = P 10
        $hiX = P 118; $hiY = P 118
        $g.FillEllipse($hiBrush, $hiX - $hiR, $hiY - $hiR, $hiR * 2, $hiR * 2)
        $hiBrush.Dispose()
    }

    $g.Dispose()
    return $bmp
}

# Render PNG bytes for each requested size, then assemble into one .ico
$sizes = @(16, 20, 24, 32, 40, 48, 64, 96, 128, 256)
$pngBytes = @()
foreach ($size in $sizes) {
    $bmp = New-AtlasBitmap $size
    $ms = New-Object System.IO.MemoryStream
    $bmp.Save($ms, [System.Drawing.Imaging.ImageFormat]::Png)
    $pngBytes += , $ms.ToArray()
    $ms.Dispose()
    $bmp.Dispose()
}

# Compose ICO container.
# Header: 6 bytes (reserved=0, type=1, count=N)
# Entries: 16 bytes each (width, height, colors, reserved, planes, bitcount, bytes_in_res, image_offset)
$outStream = New-Object System.IO.MemoryStream
$writer = New-Object System.IO.BinaryWriter $outStream
$writer.Write([uint16]0)
$writer.Write([uint16]1)
$writer.Write([uint16]$sizes.Count)

$headerSize = 6 + (16 * $sizes.Count)
$offset = $headerSize
for ($i = 0; $i -lt $sizes.Count; $i++) {
    $size = $sizes[$i]
    $bytes = $pngBytes[$i]
    $w = if ($size -ge 256) { 0 } else { [byte]$size }
    $h = if ($size -ge 256) { 0 } else { [byte]$size }
    $writer.Write([byte]$w)
    $writer.Write([byte]$h)
    $writer.Write([byte]0)      # color count = 0 (no palette)
    $writer.Write([byte]0)      # reserved
    $writer.Write([uint16]1)    # color planes
    $writer.Write([uint16]32)   # bits per pixel
    $writer.Write([uint32]$bytes.Length)
    $writer.Write([uint32]$offset)
    $offset += $bytes.Length
}
foreach ($b in $pngBytes) { $writer.Write($b) }
$writer.Flush()
[System.IO.File]::WriteAllBytes($outIco, $outStream.ToArray())
$writer.Dispose()
$outStream.Dispose()

Write-Host ("atlas.ico written: {0} ({1:N0} bytes, {2} sizes)" -f $outIco, (Get-Item $outIco).Length, $sizes.Count) -ForegroundColor Green
