package com.callmeagro.backend.service;

import com.callmeagro.backend.dto.CropSuitabilityResponse.ReferenceRange;
import com.callmeagro.backend.dto.CropSuitabilityResponse.Source;
import java.util.List;
import java.util.Map;

public final class CropClimateRules {
    public static final String VERSION = "air-temperature-reference-v1";
    private static final String OSU = "https://extension.oregonstate.edu/catalog/em-9032-educators-guide-vegetable-gardening?reference=catalog";
    private static final Map<String, Rule> RULES = Map.of(
            "potato", new Rule("potato", "Potato", new ReferenceRange(18, 20, "C",
                    "General mean daily temperature reference, with planting-time guidance; not soil readiness or yield prediction.",
                    List.of(new Source("FAO: International Year of the Potato, Cultivation", "https://www.fao.org/4/i0500e/i0500e.pdf"),
                            new Source("BAMIS: Potato", "https://www.bamis.gov.bd/en/crops/view/52/")))),
            "tomato", airRule("tomato", "Tomato", 60, 80, "OSU: Appendix B, air temperature for plant development", OSU),
            "pepper", airRule("pepper", "Pepper", 70, 80, "OSU: Appendix B, air temperature for plant development", OSU),
            "cucumber", airRule("cucumber", "Cucumber", 75, 85, "OSU: Appendix B, air temperature for plant development", OSU),
            "carrot", airRule("carrot", "Carrot", 60, 65, "OSU: Appendix A, air temperature for plant development", OSU),
            "onion", airRule("onion", "Onion", 55, 75, "UCCE: Vegetable Characteristics, page 1, general temperature reference",
                    "https://ucanr.edu/sites/default/files/2017-01/142583.pdf"));

    private CropClimateRules() {}

    public static Rule find(String id) {
        return id == null ? null : RULES.get(id);
    }

    private static Rule airRule(String id, String name, double lowF, double highF, String title, String url) {
        return new Rule(id, name, new ReferenceRange((lowF - 32) * 5 / 9, (highF - 32) * 5 / 9, "C",
                "General plant-development temperature reference applied to daily mean air temperature as a preliminary comparison; not a germination threshold.",
                List.of(new Source(title, url))));
    }

    public record Rule(String id, String name, ReferenceRange range) {}
}
