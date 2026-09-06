#!/usr/bin/env python3
"""
Converts an indexed (no antialiasing) raster polygon map into GeoJSON regions.

Requires:
    pip install rasterio
    npm install -g mapshaper

Example usage: python vectorizer.py regions.png -o regions.json

see https://github.com/joric/maps/wiki
"""
import argparse
import json
import os
import sys

import numpy as np
import rasterio
import rasterio.features


def parse_args():
    parser = argparse.ArgumentParser(
        description="Convert an indexed raster polygon map (PNG) into a simplified GeoJSON."
    )
    parser.add_argument("input", help="Path to the input raster image (e.g. T_Regions_Map.png)")
    parser.add_argument("-o", "--output", default=None,
                         help="Path to the final output GeoJSON (default: regions.json next to input)")
    parser.add_argument("--dest-res", type=float, default=812900,
                         help="Destination resolution used to compute the scale factor (default: 812900)")
    parser.add_argument("--dx", type=float, default=0, help="X offset applied after scaling (default: 0)")
    parser.add_argument("--dy", type=float, default=0, help="Y offset applied after scaling (default: 0)")
    parser.add_argument("--sieve-size", type=int, default=2,
                         help="Remove isolated regions smaller than this many pixels (default: 2)")
    parser.add_argument("--connectivity", type=int, choices=[4, 8], default=8,
                         help="Pixel connectivity used for sieving/polygon extraction (default: 8)")
    parser.add_argument("--simplify", default="5%",
                         help="Mapshaper -simplify percentage, e.g. '5%%' (default: 5%%)")
    parser.add_argument("--keep-intermediate", action="store_true",
                         help="Keep the raw (unsimplified) GeoJSON instead of deleting it")
    parser.add_argument("--skip-mapshaper", action="store_true",
                         help="Skip the mapshaper simplify/clean/explode step entirely")
    return parser.parse_args()


def vectorizer(input_path, raw_geojson_path, dest_res, dx, dy, sieve_size, connectivity):
    with rasterio.open(input_path) as src:
        height, width = src.height, src.width
        print(f"Input: {width} x {height}")

        src_res = width
        scale_factor = dest_res / src_res

        if src.count == 1:
            labels = src.read(1).astype(np.int32)
        else:
            r = src.read(1)
            g = src.read(2)
            b = src.read(3)
            labels = (r.astype(np.int64) << 16) | \
                     (g.astype(np.int64) << 8) | \
                     b.astype(np.int64)
            labels = labels.astype(np.int32)

        # Remove isolated pixel regions, merging them into the largest neighboring region
        labels = rasterio.features.sieve(labels, size=sieve_size, connectivity=connectivity)

        # Extract polygons
        results = rasterio.features.shapes(labels, connectivity=connectivity)

        features = []
        for geom, value in results:
            if geom["type"] != "Polygon":
                continue
            intvalue = int(value)
            color = f"#{intvalue:06x}"
            scaled_coords = [
                [[(x * scale_factor) + dx, (y * scale_factor) + dy] for x, y in ring]
                for ring in geom["coordinates"]
            ]
            features.append({
                "type": "Feature",
                "properties": {"color": color},
                "geometry": {"type": "Polygon", "coordinates": scaled_coords},
            })

    geojson = {"type": "FeatureCollection", "features": features}
    with open(raw_geojson_path, "w") as f:
        json.dump(geojson, f, indent=2)

    print(f"Done: {len(features)} polygons, {raw_geojson_path}")
    return len(features)


def main():
    args = parse_args()

    if not os.path.isfile(args.input):
        print(f"Error: input file not found: {args.input}", file=sys.stderr)
        sys.exit(1)

    base, _ = os.path.splitext(args.input)
    raw_geojson_path = f"{base}.json"
    final_output_path = args.output or os.path.join(os.path.dirname(args.input) or ".", "regions.json")
    final_output_path = os.path.normpath(final_output_path)

    vectorizer(
        args.input,
        raw_geojson_path,
        args.dest_res,
        args.dx,
        args.dy,
        args.sieve_size,
        args.connectivity,
    )

    if args.skip_mapshaper:
        if final_output_path != raw_geojson_path:
            os.replace(raw_geojson_path, final_output_path)
        print(f"Skipped mapshaper step. Output: {final_output_path}")
        return

    cmd = f"mapshaper {raw_geojson_path} -simplify {args.simplify} -clean -explode -o {final_output_path}"
    ret = os.system(cmd)
    if ret != 0:
        print("Error: mapshaper command failed. Is it installed? (npm install -g mapshaper)", file=sys.stderr)
        sys.exit(1)

    if not args.keep_intermediate:
        os.remove(raw_geojson_path)

    print(f"Final output: {final_output_path}")

if __name__ == "__main__":
    main()
