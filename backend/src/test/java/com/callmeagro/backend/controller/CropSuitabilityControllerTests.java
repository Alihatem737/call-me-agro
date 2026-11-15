package com.callmeagro.backend.controller;

import com.callmeagro.backend.dto.CropSuitabilityRequest;
import com.callmeagro.backend.dto.CropSuitabilityResponse;
import com.callmeagro.backend.exception.ClimateExceptionHandler;
import com.callmeagro.backend.service.CropSuitabilityService;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;
import org.springframework.web.server.ResponseStatusException;
import java.time.LocalDate;
import java.util.List;
import static org.mockito.Mockito.*;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;

import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

class CropSuitabilityControllerTests {
    private final CropSuitabilityService service = mock(CropSuitabilityService.class);
    private MockMvc mvc;
    private static final String BODY = """
            {"latitude":31.5204,"longitude":74.3587,"plantingWindow":{"from":"2025-01-01","to":"2025-01-02"},
            "comparisonCrops":["carrot","potato","tomato","onion","pepper","cucumber"]}
            """;

    @BeforeEach
    void setup() {
        mvc = MockMvcBuilders.standaloneSetup(new CropSuitabilityController(service))
                .setControllerAdvice(new ClimateExceptionHandler()).build();
    }

    @Test
    void angularCanReadValidationErrors() throws Exception {
        mvc.perform(post("/api/crop-suitability").header("Origin", "http://localhost:4200")
                        .contentType(MediaType.APPLICATION_JSON).content("{}"))
                .andExpect(status().isBadRequest())
                .andExpect(header().string("Access-Control-Allow-Origin", "http://localhost:4200"))
                .andExpect(content().contentTypeCompatibleWith("application/problem+json"));
    }

    @Test
    void angularBodyDeserializesWithoutChangingCropOrder() throws Exception {
        when(service.assess(any())).thenReturn(new CropSuitabilityResponse("PLANTING_WINDOW_AIR_TEMPERATURE",
                "Preliminary", "air-temperature-reference-v1", "Not a recommendation", null, List.of()));
        mvc.perform(post("/api/crop-suitability").contentType(MediaType.APPLICATION_JSON).content(BODY))
                .andExpect(status().isOk()).andExpect(jsonPath("$.assessmentScope").value("PLANTING_WINDOW_AIR_TEMPERATURE"))
                .andExpect(jsonPath("$.rulesVersion").value("air-temperature-reference-v1"));
        verify(service).assess(new CropSuitabilityRequest(31.5204, 74.3587,
                new CropSuitabilityRequest.PlantingWindow(LocalDate.of(2025, 1, 1), LocalDate.of(2025, 1, 2)),
                List.of("carrot", "potato", "tomato", "onion", "pepper", "cucumber")));
    }

    @ParameterizedTest
    @ValueSource(strings = {"{}", "null", "{", "{\"latitude\":0}",
            "{\"latitude\":0,\"longitude\":0,\"plantingWindow\":{},\"comparisonCrops\":[]}"})
    void invalidJsonAndMissingFieldsReturn400(String body) throws Exception {
        mvc.perform(post("/api/crop-suitability").contentType(MediaType.APPLICATION_JSON).content(body))
                .andExpect(status().isBadRequest()).andExpect(content().contentTypeCompatibleWith("application/problem+json"));
        verifyNoInteractions(service);
    }

    @Test
    void invalidCalendarDateAndEmptyCropFailBeforeService() throws Exception {
        for (String body : List.of(BODY.replace("2025-01-01", "2025-02-29"),
                BODY.replace("\"carrot\"", "null"), BODY.replace("\"carrot\"", "\" \""))) {
            mvc.perform(post("/api/crop-suitability").contentType(MediaType.APPLICATION_JSON).content(body))
                    .andExpect(status().isBadRequest());
        }
        verifyNoInteractions(service);
    }

    @ParameterizedTest
    @ValueSource(ints = {400, 422, 502, 504})
    void serviceErrorsKeepHttpStatus(int status) throws Exception {
        when(service.assess(any())).thenThrow(new ResponseStatusException(HttpStatus.valueOf(status), "Invalid request or upstream failure"));
        mvc.perform(post("/api/crop-suitability").contentType(MediaType.APPLICATION_JSON).content(BODY))
                .andExpect(status().is(status)).andExpect(jsonPath("$.detail").value("Invalid request or upstream failure"));
    }
}
