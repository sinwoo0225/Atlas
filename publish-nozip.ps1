#requires -Version 5.1
<#
.SYNOPSIS
    publish.ps1 -SkipZip 래퍼 — 압축 없이 publish/ 폴더만 생성.
.EXAMPLE
    .\publish-nozip.ps1
#>
$ErrorActionPreference = 'Stop'
& (Join-Path $PSScriptRoot 'publish.ps1') -SkipZip
exit $LASTEXITCODE
