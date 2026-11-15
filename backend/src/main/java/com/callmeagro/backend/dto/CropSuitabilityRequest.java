package com.callmeagro.backend.dto;

import jakarta.validation.Valid;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;
import java.time.LocalDate;
import java.util.List;

public record CropSuitabilityRequest(@NotNull Double latitude, @NotNull Double longitude,
        @NotNull @Valid PlantingWindow plantingWindow,
        @NotNull @Size(min = 1, max = 6) List<@NotBlank String> comparisonCrops) {
    public record PlantingWindow(@NotNull LocalDate from, @NotNull LocalDate to) {}
}
