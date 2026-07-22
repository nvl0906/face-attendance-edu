
import {TouchableOpacity, Text, StyleSheet, ActivityIndicator} from "react-native";
import useThemeStore from "../stores/useThemeStore";

const CustomButton = ({title, onPressButton, loading=false}) => {
    
    const c = useThemeStore((s) => s.primaryColor);

    const handleLogin = () => {
        if (onPressButton) {
            onPressButton();
        }
    };
    return (
        <TouchableOpacity style={styles(c).button} onPress={handleLogin}>
            {loading ? (
                <ActivityIndicator size="small" color="#fff" />
            ) : (
                <Text style={styles(c).buttonText}>{title}</Text>
            )}
        </TouchableOpacity>
    );
};

const styles = (color) => StyleSheet.create({
    button: {
        height: 42,
        width: '80%',
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: color,
        padding: 10,
        borderRadius: 5,
        marginTop: 10,
    },
    buttonText: {
        fontSize: 18,
        color: '#fff',
        textAlign: 'center',
        fontWeight: 500,
        fontStyle: 'normal',
    }
});

export default CustomButton;
