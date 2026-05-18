#requires -Version 5.1
<#
.SYNOPSIS
    atlas.ico 를 GDI+ 로 직접 생성 (atlas.svg 의 캘리그라피 "A" 디자인 동일 도형).
    SVG → ICO 변환 도구 의존 없이 멀티사이즈 ICO 를 만든다.
.DESCRIPTION
    실행 1회로 atlas.ico 생성. atlas.svg 가 바뀌면 이 스크립트의 도형도 동기 갱신.
    Quadratic bezier (SVG Q) 는 cubic 으로 변환 (Add-QSegment).
#>

$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Drawing

$here = $PSScriptRoot
$outIco = Join-Path $here 'atlas.ico'

# Atlas palette
$bg     = [System.Drawing.Color]::FromArgb(0xFF, 0x14, 0x14, 0x14)
$gold   = [System.Drawing.Color]::FromArgb(0xFF, 0xC9, 0xA9, 0x6B)
$goldHi = [System.Drawing.Color]::FromArgb(0xFF, 0xDE, 0xC3, 0x8D)
$ink    = [System.Drawing.Color]::FromArgb(0x80, 0x14, 0x14, 0x14)   # apex dot 내부 (50% opacity)

# Quadratic bezier → cubic 변환 helper. SVG 의 "Q cp end" 를 .NET AddBezier 에 맞춤.
function Add-QSegment {
    param(
        [System.Drawing.Drawing2D.GraphicsPath]$path,
        [System.Drawing.PointF]$start,
        [System.Drawing.PointF]$cp,
        [System.Drawing.PointF]$end
    )
    $c1 = New-Object System.Drawing.PointF (
        [float]($start.X + 2.0/3.0 * ($cp.X - $start.X)),
        [float]($start.Y + 2.0/3.0 * ($cp.Y - $start.Y))
    )
    $c2 = New-Object System.Drawing.PointF (
        [float]($end.X + 2.0/3.0 * ($cp.X - $end.X)),
        [float]($end.Y + 2.0/3.0 * ($cp.Y - $end.Y))
    )
    $path.AddBezier($start, $c1, $c2, $end)
}

function New-AtlasBitmap([int]$size) {
    $bmp = New-Object System.Drawing.Bitmap $size, $size
    $g = [System.Drawing.Graphics]::FromImage($bmp)
    $g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
    $g.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
    $g.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality

    # All coordinates assume a 256x256 master; scale to current size.
    $s = $size / 256.0
    function P([double]$v) { return [float]($v * $s) }
    function Pt([double]$x, [double]$y) { return New-Object System.Drawing.PointF ((P $x), (P $y)) }

    # ====== Rounded background (r=64, SVG 의 rx 와 일치) ======
    $r = P 64
    $w = P 256; $h = P 256
    $bgPath = New-Object System.Drawing.Drawing2D.GraphicsPath
    $bgPath.AddArc(0, 0, $r*2, $r*2, 180, 90)
    $bgPath.AddArc($w - $r*2, 0, $r*2, $r*2, 270, 90)
    $bgPath.AddArc($w - $r*2, $h - $r*2, $r*2, $r*2, 0, 90)
    $bgPath.AddArc(0, $h - $r*2, $r*2, $r*2, 90, 90)
    $bgPath.CloseFigure()
    $bgBrush = New-Object System.Drawing.SolidBrush $bg
    $g.FillPath($bgBrush, $bgPath)
    $bgBrush.Dispose()
    $bgPath.Dispose()

    $goldBrush = New-Object System.Drawing.SolidBrush $gold

    # ====== A 좌측 hairline upstroke (4점 polygon) ======
    $g.FillPolygon($goldBrush, [System.Drawing.PointF[]]@(
        (Pt 122 52), (Pt 132 52), (Pt 70 220), (Pt 56 220)
    ))

    # ====== A 우측 downstroke (4점 polygon, 굵음) ======
    $g.FillPolygon($goldBrush, [System.Drawing.PointF[]]@(
        (Pt 124 52), (Pt 152 52), (Pt 202 220), (Pt 174 220)
    ))

    # ====== 가로바 swash (Q bezier 4개, size>=20 에서만 — 작은 사이즈에선 흐려져 의미 없음) ======
    if ($size -ge 20) {
        $crossPath = New-Object System.Drawing.Drawing2D.GraphicsPath
        Add-QSegment $crossPath (Pt 78 154)  (Pt 130 148) (Pt 168 156)
        Add-QSegment $crossPath (Pt 168 156) (Pt 188 160) (Pt 198 144)
        Add-QSegment $crossPath (Pt 198 144) (Pt 180 168) (Pt 168 168)
        Add-QSegment $crossPath (Pt 168 168) (Pt 130 174) (Pt 78 168)
        $crossPath.CloseFigure()
        $g.FillPath($goldBrush, $crossPath)
        $crossPath.Dispose()
    }

    # ====== Apex dot (size>=24 에서만, 잉크 코어 포함) ======
    if ($size -ge 24) {
        $hiBrush = New-Object System.Drawing.SolidBrush $goldHi
        $hiR = P 6
        $g.FillEllipse($hiBrush, ((P 127) - $hiR), ((P 42) - $hiR), $hiR * 2, $hiR * 2)
        $hiBrush.Dispose()
        if ($size -ge 48) {
            $inkBrush = New-Object System.Drawing.SolidBrush $ink
            $inkR = P 2
            $g.FillEllipse($inkBrush, ((P 125) - $inkR), ((P 40) - $inkR), $inkR * 2, $inkR * 2)
            $inkBrush.Dispose()
        }
    }

    # ====== Base swash 좌 (Q bezier 2개, size>=32 에서만) ======
    if ($size -ge 32) {
        $leftSwash = New-Object System.Drawing.Drawing2D.GraphicsPath
        Add-QSegment $leftSwash (Pt 56 220)  (Pt 38 224) (Pt 32 234)
        Add-QSegment $leftSwash (Pt 32 234)  (Pt 50 228) (Pt 62 226)
        $leftSwash.CloseFigure()
        $g.FillPath($goldBrush, $leftSwash)
        $leftSwash.Dispose()
    }

    # ====== Base swash 우 (Q bezier 2개, size>=32 에서만) ======
    if ($size -ge 32) {
        $rightSwash = New-Object System.Drawing.Drawing2D.GraphicsPath
        Add-QSegment $rightSwash (Pt 202 220) (Pt 218 224) (Pt 224 232)
        Add-QSegment $rightSwash (Pt 224 232) (Pt 210 226) (Pt 196 226)
        $rightSwash.CloseFigure()
        $g.FillPath($goldBrush, $rightSwash)
        $rightSwash.Dispose()
    }

    $goldBrush.Dispose()
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
