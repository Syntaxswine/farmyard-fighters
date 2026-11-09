"""Storeys and materials follow the recorded evidence in a fixed order."""
import hashlib
import importlib.util
import json
from pathlib import Path
import unittest

ROOT = Path(__file__).resolve().parents[2]
SPEC = importlib.util.spec_from_file_location("mount_dora_builder_evidence", ROOT / "tools/maps/build-mount-dora.py")
BUILDER = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(BUILDER)


def county(stories, half=False, material="wood", source="county:STORIES 2.00"):
    return {"suggested": {"stories": stories, "halfStory": half, "storiesSource": source, "material": material,
                          "materialSource": "county:CNS_EXT_WALL_1 WOOD/METAL FRAME W/OUTER FINISH", "roofCover": "metal",
                          "roofPitch": "pitched", "yearBuilt": 1925, "porchM2": {"open": 10, "screen": 0, "enclosed": 0}, "garage": None},
            "match": {"method": "footprint", "iou": .8}, "county": {"records": [{"altKey": "1", "bldgNum": "1", "wall": "WOOD/METAL FRAME W/OUTER FINISH"}]}}


def lidar(storeys):
    return {"storeysFromLidar": storeys, "eaveM": 3.1 * storeys, "ridgeM": 3.1 * storeys + 2,
            "roof": {"form": "gable", "confidence": .9, "pitchDeg": 24, "ridgeBearingDeg": 90}}


def style(tags=None, **found):
    return BUILDER.building_style({"id": "b", "tags": tags or {}}, {"b": found})


class BuildingEvidence(unittest.TestCase):
    def test_storeys_follow_survey_then_tag_then_county_then_lidar_then_default(self):
        self.assertEqual(style({"building:levels": "3"}, county=county(1), lidar=lidar(2), survey={"stories": "2.5"})["storiesSource"], "survey:stories 2.5")
        self.assertEqual(style({"building:levels": "3"}, county=county(1), lidar=lidar(2))["stories"], 3)
        self.assertEqual(style(county=county(2), lidar=lidar(1))["storiesSource"], "county:STORIES 2.00")
        self.assertEqual(style(county=county(None, source="county:no-storey-record"), lidar=lidar(3))["storiesSource"], "lidar:eave 9.30 m")
        self.assertEqual(style()["storiesSource"], "unsurveyed-one-story-kit-proxy")
        self.assertEqual(style(lidar=lidar(7))["stories"], 5, "the native kit stops at five storeys")

    def test_half_storeys_and_disagreements_are_kept(self):
        survey_half = style(county=county(2), survey={"stories": "1.5"})
        self.assertEqual((survey_half["stories"], survey_half.get("halfStory")), (1, True))
        county_half = style(county=county(1, half=True))
        self.assertTrue(county_half["halfStory"])
        self.assertNotIn("halfStory", style(county=county(1)))
        self.assertEqual(style(county=county(1), lidar=lidar(2))["evidence"]["storiesDisagreement"], {"county": 1, "lidar": 2})
        self.assertNotIn("storiesDisagreement", style(county=county(2), lidar=lidar(2))["evidence"])

    def test_material_follows_survey_then_tag_then_county_then_default(self):
        self.assertEqual(style({"building:material": "brick"}, county=county(1), survey={"wall": "stucco"})["material"], "concrete")
        self.assertEqual(style({"building:material": "brick"}, county=county(1))["materialSource"], "tag:building:material")
        self.assertEqual(style(county=county(1))["material"], "wood")
        self.assertEqual(style(survey={"wall": "storefront"})["materialSource"], "unsurveyed-native-kit-proxy", "glass storefront has no kit wall")
        self.assertEqual(style()["material"], "brick")

    def test_real_town_sources_and_pins(self):
        project = json.loads((BUILDER.PROJECT / "project.json").read_text("utf-8"))
        for item in project["generation"]["evidenceInputs"]:
            data = (BUILDER.PROJECT / item["file"]).read_bytes()
            self.assertEqual(hashlib.sha256(data).hexdigest(), item["sha256"], item["file"])
        buildings = {f["id"]: f for f in json.loads((BUILDER.PROJECT / "features.json").read_text("utf-8"))["features"] if f["category"] == "building"}
        prefixes = ("survey:", "tag:", "county:", "lidar:", "unsurveyed-")
        self.assertTrue(all(f["nativeProxy"]["storiesSource"].startswith(prefixes) for f in buildings.values()))
        shamrock = buildings["osm-way-558337885"]["nativeProxy"]
        self.assertEqual((shamrock["stories"], shamrock["storiesSource"]), (3, "tag:building:levels"))
        self.assertEqual(shamrock["evidence"]["lidar"]["storeys"], 3)
        sourced = sum(not f["nativeProxy"]["storiesSource"].startswith("unsurveyed-") for f in buildings.values())
        self.assertGreater(sourced, 900, "nearly every building should carry a storey source")


if __name__ == "__main__":
    unittest.main()
