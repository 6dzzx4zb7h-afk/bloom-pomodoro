package dev.bloom.pomodoro;

import static org.junit.Assert.assertTrue;

import java.io.FileInputStream;
import java.io.IOException;
import java.util.Properties;
import org.junit.Test;

public class BloomUnitTest {
    @Test
    public void releaseVersionCodeMustBePositive() throws IOException {
        Properties version = new Properties();
        try (FileInputStream input = new FileInputStream("../version.properties")) {
            version.load(input);
        }

        assertTrue(Integer.parseInt(version.getProperty("VERSION_CODE")) > 0);
    }
}
