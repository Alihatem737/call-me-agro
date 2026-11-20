package com.callmeagro.backend.controller;

import com.callmeagro.backend.exception.*;
import com.callmeagro.backend.service.SatelliteMonitoringService;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;
import static org.mockito.Mockito.*;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

class SatelliteControllerTests {
    private final SatelliteMonitoringService service = mock(SatelliteMonitoringService.class);
    private MockMvc mvc;
    @BeforeEach void setup() {
        mvc = MockMvcBuilders.standaloneSetup(new SatelliteController(service))
                .setControllerAdvice(new SatelliteExceptionHandler(),new ClimateExceptionHandler()).build();
    }
    @ParameterizedTest
    @ValueSource(strings={"field-analysis","vegetation-history","available-dates"})
    void routesAndErrorsUseSatelliteContract(String path) throws Exception {
        when(service.process(any(),any())).thenThrow(new SatelliteException(HttpStatus.UNPROCESSABLE_CONTENT,"FIELD_TOO_SMALL","Small field"));
        mvc.perform(post("/api/satellite/"+path).header("Origin","http://localhost:4200")
                        .contentType(MediaType.APPLICATION_JSON).content("{\"indicator\":\"NDVI\"}"))
                .andExpect(status().is(422)).andExpect(jsonPath("$.code").value("FIELD_TOO_SMALL"))
                .andExpect(header().string("Access-Control-Allow-Origin","http://localhost:4200"));
        verify(service).process(any(),eq(path.equals("field-analysis") ? "analysis" : path.equals("vegetation-history") ? "history" : "dates"));
    }
    @ParameterizedTest
    @ValueSource(strings={"{", "null", "{\"date\":\"2025-02-29\"}"})
    void malformedBodyHasFeatureSpecificValidation(String body) throws Exception {
        mvc.perform(post("/api/satellite/field-analysis").contentType(MediaType.APPLICATION_JSON).content(body))
                .andExpect(status().isBadRequest()).andExpect(jsonPath("$.code").value("INVALID_REQUEST"));
        verifyNoInteractions(service);
    }
    @Test
    void gatewayFailureUsesProblemDetails() throws Exception {
        when(service.process(any(),any())).thenThrow(new SatelliteException(HttpStatus.GATEWAY_TIMEOUT,"PROVIDER_TIMEOUT","NASA timed out"));
        mvc.perform(post("/api/satellite/available-dates").contentType(MediaType.APPLICATION_JSON).content("{}"))
                .andExpect(status().isGatewayTimeout()).andExpect(content().contentTypeCompatibleWith("application/problem+json"))
                .andExpect(jsonPath("$.code").value("PROVIDER_TIMEOUT"));
    }
}
